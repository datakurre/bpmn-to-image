/**
 * Drives bpmn-js-token-simulation headlessly, frame by frame, according to
 * a parsed scenario (see `scenario.ts`), producing a sequence of SVG frames
 * suitable for rasterizing into an animated GIF (see `gif.ts`).
 */

import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import { tightenSvgViewBox } from '../svg-to-png';
import {
  createTokenSimulationCanvas,
  getTokenSimulationBaseModule,
  getTokenSimulationBpmnModeler,
  getTokenSimulationWindow,
} from './headless-canvas';
import { parseScenario, type Scenario, type ScenarioTrigger } from './scenario';
import { installVirtualClock } from './virtual-clock';

export interface RenderScenarioOptions {
  /** Additional/overriding moddle extensions, merged with the Camunda defaults. */
  moddleExtensions?: Record<string, unknown>;
  /**
   * Rendered animation frame rate, overriding the scenario's own `fps`
   * (which itself defaults to 12). Higher values trade smoother token
   * motion for proportionally more frames to rasterize and encode.
   */
  fps?: number;
  /** Extra ms of animation to keep rendering after the last scheduled trigger. Default: 2000. */
  tailMs?: number;
  /** Hard cap on total simulated time, guarding against scenarios that never settle. Default: 30000. */
  maxDurationMs?: number;
}

export interface AnimationFrame {
  /** Virtual simulation time (ms) this frame was captured at. */
  atMs: number;
  svg: string;
}

export interface RenderScenarioResult {
  frames: AnimationFrame[];
  frameDurationMs: number;
}

/** Resolve a scenario trigger's `take` flow id(s) into elementRegistry elements. */
function resolveTakeElements(elementRegistry: any, take: string | string[]): any[] {
  const ids = Array.isArray(take) ? take : [take];
  return ids.map((id) => elementRegistry.get(id));
}

/** Validate that every element/flow id referenced by the scenario exists in the diagram. */
function validateScenario(elementRegistry: any, triggers: ScenarioTrigger[]): void {
  const missing: string[] = [];

  for (const trigger of triggers) {
    if (!elementRegistry.get(trigger.element)) missing.push(trigger.element);

    if (trigger.take !== undefined) {
      const ids = Array.isArray(trigger.take) ? trigger.take : [trigger.take];
      for (const id of ids) {
        if (!elementRegistry.get(id)) missing.push(id);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[bpmn-to-image] scenario references element id(s) not found in the diagram: ${missing.join(', ')}`
    );
  }
}

/** Apply a single due trigger: either steer a gateway, or fire a pending event trigger. */
function applyTrigger(simulator: any, elementRegistry: any, trigger: ScenarioTrigger): boolean {
  const element = elementRegistry.get(trigger.element);

  if (trigger.take !== undefined) {
    const flows = resolveTakeElements(elementRegistry, trigger.take);
    simulator.setConfig(element, {
      activeOutgoing: Array.isArray(trigger.take) ? flows : flows[0],
    });
    return true;
  }

  const subscription = simulator.findSubscription({ element });
  if (!subscription) return false; // not reachable yet — retry on a later frame

  subscription.triggerFn();
  return true;
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a scenario,
 * into a sequence of SVG frames at a fixed virtual frame rate.
 */
export async function renderScenarioFrames(
  xml: string,
  scenarioToml: string,
  options: RenderScenarioOptions = {}
): Promise<RenderScenarioResult> {
  const scenario: Scenario = parseScenario(scenarioToml);
  const fps = options.fps ?? scenario.fps ?? 12;
  const frameDurationMs = 1000 / fps;
  const tailMs = options.tailMs ?? 2000;
  const maxDurationMs = options.maxDurationMs ?? 30000;

  const container = createTokenSimulationCanvas();
  const BpmnModeler = getTokenSimulationBpmnModeler();
  const TokenSimulationBaseModule = getTokenSimulationBaseModule();
  const moddleExtensions = { camunda: camundaModdle, ...options.moddleExtensions };

  const modeler = new BpmnModeler({
    container,
    additionalModules: [TokenSimulationBaseModule],
    moddleExtensions,
  });

  const importResult = await modeler.importXML(xml);
  const warnings: unknown[] = (importResult && (importResult as any).warnings) || [];
  if (warnings.length > 0) {
    console.error(`[bpmn-to-image] ${warnings.length} warning(s) while importing BPMN XML`);
  }

  const elementRegistry = modeler.get('elementRegistry');
  const eventBus = modeler.get('eventBus');
  const simulator = modeler.get('simulator');

  const triggers = [...(scenario.trigger ?? [])].sort((a, b) => (a.at_ms ?? 0) - (b.at_ms ?? 0));
  validateScenario(elementRegistry, triggers);

  const clock = installVirtualClock(getTokenSimulationWindow());

  try {
    // Resets the simulator (subscribes start events) and applies
    // bpmn-js-token-simulation's own interactive defaults (e.g. every
    // exclusive gateway defaults to its first outgoing flow) — the same
    // thing that happens when a user hits "play" in the browser tool.
    eventBus.fire('tokenSimulation.toggleMode', { active: true });

    const lastDueAt = triggers.reduce((max, t) => Math.max(max, t.at_ms ?? 0), 0);
    const stopAt = Math.min(lastDueAt + tailMs, maxDurationMs);

    const pending = new Set(triggers);
    const frames: AnimationFrame[] = [];

    for (let t = 0; t <= stopAt; t += frameDurationMs) {
      for (const trigger of pending) {
        if ((trigger.at_ms ?? 0) > t) continue;
        if (applyTrigger(simulator, elementRegistry, trigger)) {
          pending.delete(trigger);
        }
      }

      clock.advance(frameDurationMs);

      const { svg } = await modeler.saveSVG();
      frames.push({ atMs: t, svg: tightenSvgViewBox(svg || '', elementRegistry.getAll()) });
    }

    if (pending.size > 0) {
      const unapplied = [...pending].map((t) => t.element).join(', ');
      console.error(
        `[bpmn-to-image] scenario trigger(s) never became reachable and were not fired: ${unapplied}`
      );
    }

    return { frames, frameDurationMs };
  } finally {
    clock.restore();
  }
}
