/**
 * TOML scenario format for steering bpmn-js-token-simulation.
 *
 * By itself, token simulation only knows how to auto-advance through
 * activities — a gateway with multiple outgoing flows, or a catch/boundary
 * event, needs an explicit decision (in the interactive tool, a mouse
 * click). A scenario is the headless equivalent of that click stream.
 *
 * Rather than one flat, diagram-wide trigger list, a scenario is a set of
 * **named tokens** — each one an independent timeline through the diagram,
 * spawned from its own start-event trigger and then walking its own
 * ordered list of steps (gateway decisions and catch/boundary-event
 * triggers) *as that specific token encounters them*. This is what makes
 * concurrent tokens (parallel branches, multiple start events/instances, a
 * loop revisiting the same gateway) independently controllable: the engine
 * (see `simulate.ts`) tracks which running scope belongs to which named
 * token, so "take Flow_a" for token A's first visit to a gateway never
 * affects token B's visit to that same gateway.
 *
 * `exportScenarioTemplate` walks a diagram's actual control flow and
 * generates a ready-to-run scenario covering it, so scenario authoring
 * starts from "this diagram's actual tokens/gateways/events" rather than a
 * blank file.
 */

import { BpmnModdle } from 'bpmn-moddle';
import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import { parse as parseToml } from 'smol-toml';

/**
 * One step in a token's timeline: fires an event (start/intermediate-catch/
 * boundary), or steers a gateway.
 */
export interface ScenarioStep {
  /** BPMN element id (start event, catch/boundary event, or gateway). */
  element: string;
  /**
   * Event steps only (start/catch/boundary): virtual time (ms from
   * simulation start) at which this step becomes due. Applied as soon as
   * the clock reaches this time *and* this token has a matching pending
   * wait on that element. Default: 0. Ignored for gateway steps, which
   * apply reactively the moment this token's flow reaches that gateway
   * (there's no "too early" for a decision the token hasn't reached yet).
   */
  at_ms?: number;
  /**
   * Gateway steering only: the outgoing sequence flow id to take (exclusive
   * gateway), or ids to take (inclusive gateway fork). Omit for event
   * steps (start/intermediate-catch/boundary).
   */
  take?: string | string[];
}

/** One token's independent timeline through the diagram. */
export interface ScenarioToken {
  /** Label for readability/debugging; auto-generated (`token-1`, ...) when omitted. */
  name?: string;
  /**
   * Ordered steps for this token. The first step spawns it (must target a
   * start event); later steps are consumed in order as this token's flow
   * reaches each named element — so listing the same gateway/event id
   * twice controls its first visit, then its second (e.g. around a loop).
   */
  step: ScenarioStep[];
}

export interface Scenario {
  /** Rendered animation frame rate. Default: 12. */
  fps?: number;
  token?: ScenarioToken[];
}

function assertStep(step: unknown, where: string): asserts step is ScenarioStep {
  const s = step as Partial<ScenarioStep> | null;
  if (!s || typeof s.element !== 'string' || s.element.length === 0) {
    throw new Error(`[bpmn-to-image] ${where} is missing a string "element" id`);
  }
}

/** Parse a scenario TOML document. */
export function parseScenario(toml: string): Scenario {
  const parsed = parseToml(toml) as unknown as Scenario;

  (parsed.token ?? []).forEach((token, tokenIndex) => {
    const label = token.name ?? `token[${tokenIndex}]`;
    if (!Array.isArray(token.step) || token.step.length === 0) {
      throw new Error(`[bpmn-to-image] token "${label}" has no [[token.step]] entries`);
    }
    token.step.forEach((step, stepIndex) => assertStep(step, `${label}.step[${stepIndex}]`));
  });

  return parsed;
}

/** Assign auto-generated names to tokens that don't have one. */
export function namedTokens(scenario: Scenario): Required<ScenarioToken>[] {
  return (scenario.token ?? []).map((token, i) => ({
    name: token.name ?? `token-${i + 1}`,
    step: token.step,
  }));
}

// ── Scaffold export ─────────────────────────────────────────────────────

const GATEWAY_TYPES = new Set(['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway']);
const EVENT_STEP_TYPES = new Set([
  'bpmn:StartEvent',
  'bpmn:IntermediateCatchEvent',
  'bpmn:BoundaryEvent',
]);
const PARALLEL_GATEWAY = 'bpmn:ParallelGateway';

/** Time (ms) added per discovered event/gateway step while walking a token's default path. */
const STEP_SPACING_MS = 500;
/** Guard against runaway walks on cyclic diagrams — each token's default walk stops after this many elements. */
const MAX_WALK_STEPS = 200;

function isSequenceFlow(el: any): boolean {
  return el?.$type === 'bpmn:SequenceFlow';
}

function outgoingFlows(el: any): any[] {
  return (el.outgoing ?? []).filter(isSequenceFlow);
}

/** All flow elements in a process, including inside nested sub-processes, indexed by id. */
function indexFlowElements(flowElements: any[] | undefined, byId: Map<string, any>): void {
  for (const el of flowElements ?? []) {
    byId.set(el.id, el);
    if (Array.isArray(el.flowElements)) indexFlowElements(el.flowElements, byId);
  }
}

interface WalkContext {
  visited: Set<string>;
  steps: DiscoveredStep[];
  atMs: number;
  /** Boundary events attached to each activity id, keyed by host activity id. */
  boundaryEventsByHost: Map<string, any[]>;
}

interface DiscoveredStep {
  element: string;
  name?: string;
  take?: string;
  takeOptions?: string[];
  takeAll?: string[];
  atMs: number;
}

/**
 * Walk a token's default path from `element` onward — the same path the
 * diagram would take with no scenario at all (first outgoing flow at every
 * gateway, every branch of a parallel fork) — collecting the gateways and
 * catch/boundary events it passes through, in encounter order.
 */
function walkDefaultPath(element: any, ctx: WalkContext): void {
  if (!element || ctx.visited.has(element.id) || ctx.steps.length > MAX_WALK_STEPS) return;
  ctx.visited.add(element.id);

  // Boundary events aren't reachable via sequence flow — attach them
  // wherever their host activity is visited.
  for (const boundaryEvent of ctx.boundaryEventsByHost.get(element.id) ?? []) {
    walkDefaultPath(boundaryEvent, ctx);
  }

  if (GATEWAY_TYPES.has(element.$type)) {
    const outgoing = outgoingFlows(element);
    if (outgoing.length > 1) {
      ctx.steps.push({
        element: element.id,
        name: element.name,
        take: outgoing[0].id,
        takeOptions: outgoing.map((f: any) => f.id),
        takeAll:
          element.$type === 'bpmn:InclusiveGateway' ? outgoing.map((f: any) => f.id) : undefined,
        atMs: ctx.atMs,
      });
      ctx.atMs += STEP_SPACING_MS;
    }
    walkDefaultPath(outgoing[0]?.targetRef, ctx);
    return;
  }

  if (element.$type === PARALLEL_GATEWAY) {
    // AND-split: every branch runs, no decision needed — walk them all.
    for (const flow of outgoingFlows(element)) {
      walkDefaultPath(flow.targetRef, ctx);
    }
    return;
  }

  if (EVENT_STEP_TYPES.has(element.$type) && element.$type !== 'bpmn:StartEvent') {
    ctx.steps.push({ element: element.id, name: element.name, atMs: ctx.atMs });
    ctx.atMs += STEP_SPACING_MS;
  }

  if (element.$type === 'bpmn:BoundaryEvent') {
    // Continues from the boundary event itself, not from the activity it interrupts.
    for (const flow of outgoingFlows(element)) walkDefaultPath(flow.targetRef, ctx);
    return;
  }

  // Plain pass-through: tasks, gateways with a single outgoing flow, throw
  // events, sub-processes (walked as opaque activities), etc.
  const outgoing = outgoingFlows(element);
  if (outgoing.length === 1) {
    walkDefaultPath(outgoing[0].targetRef, ctx);
  } else {
    for (const flow of outgoing) walkDefaultPath(flow.targetRef, ctx);
  }
}

/**
 * Collapse a BPMN label to a single line for safe embedding in a TOML `#`
 * comment — labels can contain literal line breaks (multi-line element
 * names are common in BPMN diagrams), and a comment only extends to the
 * end of its own line, so an embedded newline would leave the rest of the
 * label as a stray, unparseable line in the generated TOML.
 */
function sanitizeComment(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function formatStepLines(step: DiscoveredStep, indent: string): string[] {
  const label = step.name ? ` # ${sanitizeComment(step.name)}` : '';
  const lines = [`${indent}[[token.step]]`, `${indent}element = "${step.element}"${label}`];
  if (step.takeAll) {
    lines.push(`${indent}take = [${step.takeAll.map((id) => `"${id}"`).join(', ')}]`);
  } else if (step.take) {
    lines.push(`${indent}take = "${step.take}"  # options: ${step.takeOptions!.join(', ')}`);
  } else {
    lines.push(`${indent}at_ms = ${step.atMs}`);
  }
  return lines;
}

/**
 * Inspect a BPMN diagram and generate a scenario TOML scaffold: one named
 * token per start event found (each walking that diagram's default path —
 * first outgoing flow at every gateway, matching bpmn-js-token-simulation's
 * own interactive default), covering every gateway and catch/boundary
 * event it would pass through. Alternative outgoing flows are listed in a
 * comment; multiple tokens are staggered so the rendered animation reads
 * clearly instead of overlapping.
 */
export async function exportScenarioTemplate(xml: string): Promise<string> {
  const moddle = new BpmnModdle({ camunda: camundaModdle });
  const { rootElement } = await moddle.fromXML(xml);

  const processes = (rootElement.rootElements ?? []).filter(
    (el: any) => el.$type === 'bpmn:Process'
  );

  const byId = new Map<string, any>();
  for (const process of processes) indexFlowElements(process.flowElements, byId);

  const startEvents = [...byId.values()].filter((el) => el.$type === 'bpmn:StartEvent');

  const boundaryEventsByHost = new Map<string, any[]>();
  for (const el of byId.values()) {
    if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef) {
      const hostId = el.attachedToRef.id;
      const list = boundaryEventsByHost.get(hostId) ?? [];
      list.push(el);
      boundaryEventsByHost.set(hostId, list);
    }
  }

  const lines: string[] = [
    '# Token-simulation scenario, generated by bpmn-to-image.',
    '#',
    '# Each [[token]] is one independent token walking its own [[token.step]]',
    '# timeline: the first step spawns it (a start event), later steps steer',
    '# a gateway it reaches (`take`) or fire a catch/boundary event it is',
    '# waiting on (at `at_ms`, ms from simulation start). Add more [[token]]',
    '# blocks for concurrent tokens; repeat the same element id within one',
    "# token's steps to control a loop's 2nd, 3rd, ... visit.",
    '',
    'fps = 12',
    '',
  ];

  startEvents.forEach((startEvent, index) => {
    const ctx: WalkContext = {
      visited: new Set(),
      steps: [],
      atMs: index * 300,
      boundaryEventsByHost,
    };
    walkDefaultPath(startEvent, ctx);

    const tokenName = startEvent.name
      ? `${slugify(startEvent.name)}-${index + 1}`
      : `token-${index + 1}`;

    lines.push('[[token]]', `name = "${tokenName}"`, '');
    lines.push(
      ...formatStepLines({ element: startEvent.id, name: startEvent.name, atMs: index * 300 }, '  ')
    );
    lines.push('');
    for (const step of ctx.steps) {
      lines.push(...formatStepLines(step, '  '));
      lines.push('');
    }
  });

  return lines.join('\n');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
