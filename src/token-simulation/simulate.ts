/**
 * Drives bpmn-js-token-simulation headlessly, frame by frame, according to
 * a parsed scenario's named tokens (see `scenario.ts`), producing a
 * sequence of SVG frames suitable for rasterizing into an animation.
 *
 * The engine tags every simulator scope with the name of the token whose
 * timeline spawned it (propagated from parent scope to child scope as the
 * simulation runs), so a step in token A's timeline only ever matches
 * scopes descended from token A — token B taking a different branch at the
 * very same gateway, or waiting on the very same catch event, is
 * unaffected. See the module comment in `scenario.ts` for the full
 * rationale.
 *
 * Gateway steps are applied *reactively*: bpmn-js-token-simulation
 * evaluates a gateway's outgoing flow synchronously the instant a token
 * enters it (there is no later moment to configure it), so we listen for
 * the simulator's own 'enter' trace event and call `setConfig` just before
 * the gateway behavior reads it — timing-independent, unlike a fixed
 * `at_ms` guess. Event steps (start/catch/boundary) are still applied from
 * the per-frame loop, since firing them *is* the external stimulus that
 * moves virtual time forward for that token.
 */

import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import { tightenSvgViewBox } from '../svg-to-png';
import {
  createTokenSimulationCanvas,
  getTokenSimulationBaseModule,
  getTokenSimulationBpmnModeler,
  getTokenSimulationWindow,
} from './headless-canvas';
import type { OnProgress } from './progress';
import {
  exportScenarioTemplate,
  namedTokens,
  parseScenario,
  type Scenario,
  type ScenarioStep,
} from './scenario';
import { installVirtualClock } from './virtual-clock';

/** Frame rate used when neither `fps` nor `smooth` is given, nor the scenario's own `fps`. Fast to render — meant for iterating on a scenario. */
export const DEFAULT_FPS = 12;
/** Frame rate used by `smooth: true` — a "final render" preset, smoother than is worth the extra render cost by default. */
export const SMOOTH_FPS = 30;

export interface RenderScenarioOptions {
  /** Additional/overriding moddle extensions, merged with the Camunda defaults. */
  moddleExtensions?: Record<string, unknown>;
  /** Background color (CSS color string, e.g. "white", "#FFFFFF"). Default: undefined (transparent). */
  background?: string;
  /**
   * Rendered animation frame rate, overriding both `smooth` and the
   * scenario's own `fps`. Higher values trade smoother token motion for
   * proportionally more frames to rasterize and encode.
   */
  fps?: number;
  /**
   * Render at a smoother preset frame rate ({@link SMOOTH_FPS}) instead of
   * the fast default ({@link DEFAULT_FPS}) — meant for the final render
   * once you're happy with a scenario, after iterating on it at the
   * cheaper default. Ignored when `fps` is set explicitly; overrides the
   * scenario's own `fps` (this is a rendering-quality choice, not part of
   * the scenario itself).
   */
  smooth?: boolean;
  /** Extra ms of animation to keep rendering after the last scheduled event step. Default: 1000. */
  tailMs?: number;
  /** Hard cap on total simulated time, guarding against scenarios that never settle. Default: 30000. */
  maxDurationMs?: number;
  /** Called once per rendered frame while driving the simulation. */
  onProgress?: OnProgress;
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

const GATEWAY_TYPES = new Set(['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway']);

interface TrackedToken {
  name: string;
  steps: { step: ScenarioStep; consumed: boolean }[];
}

/** Per-render bookkeeping: which scope belongs to which named token, and each token's remaining steps. */
class TokenTracker {
  private readonly tokenNameByScope = new WeakMap<any, string>();
  private readonly tokens: TrackedToken[];
  /** Set right before calling a start-event trigger, so the newly-created root scope gets tagged. */
  private expectingTokenName: string | null = null;

  constructor(tokens: { name: string; step: ScenarioStep[] }[]) {
    this.tokens = tokens.map((t) => ({
      name: t.name,
      steps: t.step.map((step) => ({ step, consumed: false })),
    }));
  }

  /** Wire scope-tagging propagation into the simulator's eventBus. Call once, before driving the simulation. */
  attach(eventBus: any): void {
    eventBus.on('tokenSimulation.simulator.createScope', ({ scope }: { scope: any }) => {
      if (this.expectingTokenName && !scope.parent) {
        this.tokenNameByScope.set(scope, this.expectingTokenName);
        this.expectingTokenName = null;
      } else if (scope.parent && this.tokenNameByScope.has(scope.parent)) {
        this.tokenNameByScope.set(scope, this.tokenNameByScope.get(scope.parent)!);
      }
    });
  }

  tokenNames(): string[] {
    return this.tokens.map((t) => t.name);
  }

  /** The first unconsumed step of `element` for `tokenName`, if any. */
  private findPendingStep(
    tokenName: string,
    element: string
  ): { step: ScenarioStep; consumed: boolean } | undefined {
    const token = this.tokens.find((t) => t.name === tokenName);
    return token?.steps.find((s) => !s.consumed && s.step.element === element);
  }

  /** Reactively apply a gateway decision the instant a tagged token's flow enters it. */
  installGatewayHook(eventBus: any, elementRegistry: any, simulator: any): void {
    eventBus.on('tokenSimulation.simulator.trace', ({ action, element, scope }: any) => {
      if (action !== 'enter' || !element || !GATEWAY_TYPES.has(element.type)) return;
      const tokenName = scope && this.tokenNameByScope.get(scope);
      if (!tokenName) return;

      const entry = this.findPendingStep(tokenName, element.id);
      if (!entry || entry.step.take === undefined) return;

      const ids = Array.isArray(entry.step.take) ? entry.step.take : [entry.step.take];
      const flows = ids.map((id) => elementRegistry.get(id));
      simulator.setConfig(element, {
        activeOutgoing: Array.isArray(entry.step.take) ? flows : flows[0],
      });
      entry.consumed = true;
    });
  }

  /** Fire the given token's next due event step (start/catch/boundary), if reachable. Returns whether one fired. */
  applyDueEventStep(
    tokenName: string,
    atMs: number,
    simulator: any,
    elementRegistry: any
  ): boolean {
    const token = this.tokens.find((t) => t.name === tokenName)!;
    const entry = token.steps.find((s) => !s.consumed && s.step.take === undefined);
    if (!entry) return false;
    if ((entry.step.at_ms ?? 0) > atMs) return false;

    const element = elementRegistry.get(entry.step.element);
    if (!element) return false;

    if (entry === token.steps[0]) {
      // Spawns this token: match any pending subscription (the shared,
      // untagged process-definition scope holds it) and tag the new scope.
      const subscription = simulator.findSubscription({ element });
      if (!subscription) return false;
      this.expectingTokenName = tokenName;
      subscription.triggerFn();
      this.expectingTokenName = null;
      entry.consumed = true;
      return true;
    }

    // A later event step: only fire the subscription that belongs to this
    // specific token, so concurrent tokens waiting on the same catch event
    // don't steal each other's trigger.
    const subscriptions = simulator.findSubscriptions({ element });
    const mine = subscriptions.find((s: any) => this.tokenNameByScope.get(s.scope) === tokenName);
    if (!mine) return false;
    mine.triggerFn();
    entry.consumed = true;
    return true;
  }

  /** Whether any token still has an unconsumed event step scheduled in the future (`at_ms > atMs`). */
  hasFutureEventSteps(atMs: number): boolean {
    return this.tokens.some((t) =>
      t.steps.some((s) => !s.consumed && s.step.take === undefined && (s.step.at_ms ?? 0) > atMs)
    );
  }

  unconsumedSteps(): { tokenName: string; element: string }[] {
    return this.tokens.flatMap((t) =>
      t.steps
        .filter((s) => !s.consumed)
        .map((s) => ({ tokenName: t.name, element: s.step.element }))
    );
  }
}

/** Validate that every element/flow id referenced by the scenario exists in the diagram, and each token's first step is a start event. */
function validateScenario(
  elementRegistry: any,
  tokens: { name: string; step: ScenarioStep[] }[]
): void {
  const missing: string[] = [];
  const badFirstStep: string[] = [];

  for (const token of tokens) {
    const first = elementRegistry.get(token.step[0].element);
    if (!first) missing.push(token.step[0].element);
    else if (first.type !== 'bpmn:StartEvent') badFirstStep.push(token.name);

    for (const step of token.step) {
      if (!elementRegistry.get(step.element)) missing.push(step.element);
      if (step.take !== undefined) {
        const ids = Array.isArray(step.take) ? step.take : [step.take];
        for (const id of ids) if (!elementRegistry.get(id)) missing.push(id);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[bpmn-to-image] scenario references element id(s) not found in the diagram: ${[...new Set(missing)].join(', ')}`
    );
  }
  if (badFirstStep.length > 0) {
    throw new Error(
      `[bpmn-to-image] token(s) must start with a start-event step: ${badFirstStep.join(', ')}`
    );
  }
}

/**
 * Render any active TokenCount overlays (tokens stopped/waiting at gateways,
 * catch events, or tasks) as SVG elements with jumping bounce animation,
 * matching bpmn-js-token-simulation's interactive overlay appearance.
 */
function renderTokenCountsSvg(overlays: any, t: number): string {
  const tokenCountOverlays = overlays?.get?.({ type: 'bts-token-count' }) ?? [];
  if (!Array.isArray(tokenCountOverlays) || tokenCountOverlays.length === 0) return '';

  // Sine bounce jumping animation matching CSS @keyframes bts-jump { 50% { top: 5px; } }
  const jumpOffset = Math.sin(Math.PI * ((t % 1000) / 1000)) * 5;
  const groups: string[] = [];

  for (const overlay of tokenCountOverlays) {
    const element = overlay.element;
    if (!element) continue;

    let x = element.x ?? 0;
    let y = element.y ?? 0;
    let width = element.width ?? 0;
    let height = element.height ?? 0;

    if (element.waypoints && Array.isArray(element.waypoints) && element.waypoints.length > 0) {
      const xs = element.waypoints.map((p: any) => p.x);
      const ys = element.waypoints.map((p: any) => p.y);
      x = Math.min(...xs);
      y = Math.min(...ys);
      width = Math.max(...xs) - x;
      height = Math.max(...ys) - y;
    }

    const pos = overlay.position ?? {};
    let left = pos.left ?? 0;
    let top = pos.top ?? 0;

    if (pos.right !== undefined) {
      left = pos.right * -1 + width;
    }
    if (pos.bottom !== undefined) {
      top = pos.bottom * -1 + height;
    }

    const baseX = x + left;
    const baseY = y + top;

    const html = overlay.html;
    const tokenCountNodes = html?.querySelectorAll ? html.querySelectorAll('.bts-token-count') : [];

    if (!tokenCountNodes || tokenCountNodes.length === 0) continue;

    for (let i = 0; i < tokenCountNodes.length; i++) {
      const node = tokenCountNodes[i];
      if (node.classList?.contains('inactive')) continue;

      const count = node.textContent?.trim() || '1';
      const bg = node.style?.backgroundColor || node.style?.background || '#10D070';
      const color = node.style?.color || '#FFFFFF';

      const offsetX = i * 17;
      const finalX = baseX + offsetX;
      const finalY = baseY + jumpOffset;

      groups.push(
        `<g class="bts-token-count" transform="translate(${finalX}, ${finalY})">` +
          `<circle class="bts-circle" r="12.5" cx="12.5" cy="12.5" fill="${bg}" />` +
          `<text class="bts-text" transform="translate(12.5, 17)" text-anchor="middle" fill="${color}" font-size="13" font-family="Arial, sans-serif" font-weight="bold">${count}</text>` +
          `</g>`
      );
    }
  }

  if (groups.length === 0) return '';
  return `<g class="bts-token-counts">${groups.join('')}</g>`;
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a
 * scenario's named tokens, into a sequence of SVG frames at a fixed
 * virtual frame rate.
 *
 * `scenarioToml` is optional — omit it (or pass `undefined`) to render the
 * diagram's own default scenario (see `exportScenarioTemplate`): one token
 * per start event, walking the first-outgoing-flow path through every
 * gateway, same as the interactive tool with no clicks at all.
 */
export async function renderScenarioFrames(
  xml: string,
  scenarioToml?: string,
  options: RenderScenarioOptions = {}
): Promise<RenderScenarioResult> {
  const scenario: Scenario = parseScenario(scenarioToml ?? (await exportScenarioTemplate(xml)));
  const tokens = namedTokens(scenario);
  const fps = options.fps ?? (options.smooth ? SMOOTH_FPS : (scenario.fps ?? DEFAULT_FPS));
  const frameDurationMs = 1000 / fps;
  const tailMs = options.tailMs ?? 1000;
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
  const animation = modeler.get('animation');
  const overlays = modeler.get('overlays');

  validateScenario(elementRegistry, tokens);

  const tracker = new TokenTracker(tokens);
  tracker.attach(eventBus);
  tracker.installGatewayHook(eventBus, elementRegistry, simulator);

  const clock = installVirtualClock(getTokenSimulationWindow());

  try {
    // Resets the simulator (subscribes start events) and applies
    // bpmn-js-token-simulation's own interactive defaults (e.g. every
    // exclusive gateway defaults to its first outgoing flow) — the same
    // thing that happens when a user hits "play" in the browser tool.
    // Our gateway hook (installed above) overrides these reactively for
    // any gateway a scenario step actually names.
    eventBus.fire('tokenSimulation.toggleMode', { active: true });

    const lastEventStepAt = tokens.reduce(
      (max, t) =>
        Math.max(max, ...t.step.filter((s) => s.take === undefined).map((s) => s.at_ms ?? 0)),
      0
    );
    const estimatedTotalFrames = Math.max(
      Math.floor((lastEventStepAt + tailMs) / frameDurationMs) + 1,
      1
    );

    const tokenNames = tracker.tokenNames();
    const frames: AnimationFrame[] = [];
    let idleSinceMs: number | null = null;
    let t = 0;

    while (t <= maxDurationMs) {
      for (const tokenName of tokenNames) {
        tracker.applyDueEventStep(tokenName, t, simulator, elementRegistry);
      }

      let { svg } = await modeler.saveSVG();
      const tokenCountsSvg = renderTokenCountsSvg(overlays, t);
      if (tokenCountsSvg && svg) {
        svg = svg.replace('</svg>', `${tokenCountsSvg}</svg>`);
      }
      frames.push({
        atMs: t,
        svg: tightenSvgViewBox(svg || '', elementRegistry.getAll(), undefined, options.background),
      });
      const progressTotal = Math.max(estimatedTotalFrames, frames.length);
      options.onProgress?.({ phase: 'simulate', current: frames.length, total: progressTotal });

      const active =
        Boolean(animation && animation._animations && animation._animations.size > 0) ||
        tracker.hasFutureEventSteps(t);

      if (active) {
        idleSinceMs = null;
      } else {
        if (idleSinceMs === null) {
          idleSinceMs = t;
        }
        if (t - idleSinceMs >= tailMs) {
          break;
        }
      }

      clock.advance(frameDurationMs);
      t += frameDurationMs;
    }

    const unconsumed = tracker.unconsumedSteps();
    if (unconsumed.length > 0) {
      const list = unconsumed.map((s) => `${s.tokenName}:${s.element}`).join(', ');
      console.error(
        `[bpmn-to-image] scenario step(s) never became reachable and were not applied: ${list}`
      );
    }

    return { frames, frameDurationMs };
  } finally {
    clock.restore();
  }
}
