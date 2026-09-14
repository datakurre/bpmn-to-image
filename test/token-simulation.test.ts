import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { framesToMp4, framesToWebp, isFfmpegAvailable } from '../src/token-simulation/ffmpeg';
import { framesToGif } from '../src/token-simulation/gif';
import {
  exportScenarioTemplate,
  namedTokens,
  parseScenario,
} from '../src/token-simulation/scenario';
import { DEFAULT_FPS, SMOOTH_FPS, renderScenarioFrames } from '../src/token-simulation/simulate';
import {
  renderScenarioToApng,
  renderScenarioToGif,
  renderScenarioToMp4,
} from '../src/token-simulation';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');
const robotXml = readFileSync(join(__dirname, 'fixtures/robot.bpmn'), 'utf-8');
const gatewayXml = readFileSync(join(__dirname, 'fixtures/gateway.bpmn'), 'utf-8');
const multilineLabelXml = readFileSync(join(__dirname, 'fixtures/multiline-label.bpmn'), 'utf-8');
const intermediateTimerXml = readFileSync(
  join(__dirname, 'fixtures/intermediate-timer.bpmn'),
  'utf-8'
);
const exampleXml = readFileSync(join(__dirname, '../example.bpmn'), 'utf-8');
const boundaryEventXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   id="Definitions_boundary"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_boundary" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_to_task</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_main">
      <bpmn:incoming>Flow_to_task</bpmn:incoming>
      <bpmn:outgoing>Flow_normal</bpmn:outgoing>
    </bpmn:task>
    <bpmn:boundaryEvent id="BoundaryEvent_1" attachedToRef="Task_main">
      <bpmn:outgoing>Flow_boundary</bpmn:outgoing>
      <bpmn:timerEventDefinition />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="EndEvent_normal">
      <bpmn:incoming>Flow_normal</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="EndEvent_boundary">
      <bpmn:incoming>Flow_boundary</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_to_task" sourceRef="StartEvent_1" targetRef="Task_main" />
    <bpmn:sequenceFlow id="Flow_normal" sourceRef="Task_main" targetRef="EndEvent_normal" />
    <bpmn:sequenceFlow id="Flow_boundary" sourceRef="BoundaryEvent_1" targetRef="EndEvent_boundary" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_boundary">
    <bpmndi:BPMNPlane id="BPMNPlane_boundary" bpmnElement="Process_boundary">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_main_di" bpmnElement="Task_main"><dc:Bounds x="180" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="BoundaryEvent_1_di" bpmnElement="BoundaryEvent_1"><dc:Bounds x="230" y="142" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_normal_di" bpmnElement="EndEvent_normal"><dc:Bounds x="350" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_boundary_di" bpmnElement="EndEvent_boundary"><dc:Bounds x="350" y="220" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_to_task_di" bpmnElement="Flow_to_task"><di:waypoint x="136" y="118" /><di:waypoint x="180" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_normal_di" bpmnElement="Flow_normal"><di:waypoint x="280" y="118" /><di:waypoint x="350" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_boundary_di" bpmnElement="Flow_boundary"><di:waypoint x="248" y="178" /><di:waypoint x="248" y="238" /><di:waypoint x="350" y="238" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const subProcessXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   id="Definitions_subProcess"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_subProcess" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_to_sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:incoming>Flow_to_sub</bpmn:incoming>
      <bpmn:outgoing>Flow_from_sub</bpmn:outgoing>
      <bpmn:startEvent id="SubStartEvent_1">
        <bpmn:outgoing>Flow_sub_to_task</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="SubTask_1">
        <bpmn:incoming>Flow_sub_to_task</bpmn:incoming>
        <bpmn:outgoing>Flow_sub_to_end</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="SubEndEvent_1">
        <bpmn:incoming>Flow_sub_to_end</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="Flow_sub_to_task" sourceRef="SubStartEvent_1" targetRef="SubTask_1" />
      <bpmn:sequenceFlow id="Flow_sub_to_end" sourceRef="SubTask_1" targetRef="SubEndEvent_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_from_sub</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_to_sub" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_from_sub" sourceRef="SubProcess_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_subProcess">
    <bpmndi:BPMNPlane id="BPMNPlane_subProcess" bpmnElement="Process_subProcess">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true"><dc:Bounds x="180" y="60" width="300" height="120" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubStartEvent_1_di" bpmnElement="SubStartEvent_1"><dc:Bounds x="200" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubTask_1_di" bpmnElement="SubTask_1"><dc:Bounds x="280" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEndEvent_1_di" bpmnElement="SubEndEvent_1"><dc:Bounds x="420" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="520" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_to_sub_di" bpmnElement="Flow_to_sub"><di:waypoint x="136" y="118" /><di:waypoint x="180" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_sub_to_task_di" bpmnElement="Flow_sub_to_task"><di:waypoint x="236" y="118" /><di:waypoint x="280" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_sub_to_end_di" bpmnElement="Flow_sub_to_end"><di:waypoint x="380" y="118" /><di:waypoint x="420" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_from_sub_di" bpmnElement="Flow_from_sub"><di:waypoint x="480" y="118" /><di:waypoint x="520" y="118" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** Extract all `<g class="bts-token" transform="translate(x, y)">` positions from an SVG frame. */
function tokenPositions(svg: string): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const re = /<g class="bts-token" transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/g;
  let match;
  while ((match = re.exec(svg))) {
    positions.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  return positions;
}

/** Extract all text content inside `<g class="bts-token">` text elements from an SVG frame. */
function tokenGfxNumbers(svg: string): string[] {
  const matches = [
    ...svg.matchAll(
      /<g class="bts-token"[^>]*>[\s\S]*?<text class="bts-text"[^>]*>([^<]+)<\/text>/g
    ),
  ];
  return matches.map((m) => m[1].trim());
}

/** Extract all text content inside `<g class="bts-token-count">` text elements from an SVG frame. */
function tokenCountNumbers(svg: string): string[] {
  const matches = [
    ...svg.matchAll(
      /<g class="bts-token-count"[^>]*>[\s\S]*?<text class="bts-text"[^>]*>([^<]+)<\/text>/g
    ),
  ];
  return matches.map((m) => m[1].trim());
}

const oneTokenScenario = `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`;

describe('parseScenario', () => {
  test('parses fps and named tokens with nested steps', () => {
    const scenario = parseScenario(`
fps = 24

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Gateway_1"
  take = "Flow_a"
`);
    expect(scenario.fps).toBe(24);
    expect(scenario.token).toHaveLength(1);
    expect(scenario.token?.[0].name).toBe('t1');
    expect(scenario.token?.[0].step).toHaveLength(2);
    expect(scenario.token?.[0].step[1]).toMatchObject({ element: 'Gateway_1', take: 'Flow_a' });
  });

  test('rejects a step without an element id', () => {
    expect(() => parseScenario('[[token]]\nname = "t1"\n[[token.step]]\nat_ms = 0\n')).toThrow(
      /element/
    );
  });

  test('rejects a token with no steps', () => {
    expect(() => parseScenario('[[token]]\nname = "t1"\n')).toThrow(/no \[\[token\.step\]\]/);
  });

  test('parses and validates token number', () => {
    const scenario = parseScenario(`
[[token]]
name = "t1"
number = 42

  [[token.step]]
  element = "StartEvent_1"
`);
    expect(scenario.token?.[0].number).toBe(42);
    expect(() =>
      parseScenario(
        '[[token]]\nname = "t1"\nnumber = "invalid"\n[[token.step]]\nelement = "StartEvent_1"\n'
      )
    ).toThrow(/number/);
  });

  test('parses and validates task_pause_ms and pause_ms', () => {
    const scenario = parseScenario(`
task_pause_ms = 500

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Task_1"
  pause_ms = 1000
`);
    expect(scenario.task_pause_ms).toBe(500);
    expect(scenario.token?.[0].step[1].pause_ms).toBe(1000);

    const scenarioAlias = parseScenario(`
pause_ms = 300

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Task_1"
  wait_ms = 800
`);
    expect(scenarioAlias.pause_ms).toBe(300);
    expect(scenarioAlias.token?.[0].step[1].wait_ms).toBe(800);

    expect(() =>
      parseScenario(
        'task_pause_ms = -1\n[[token]]\nname = "t1"\n[[token.step]]\nelement = "StartEvent_1"\n'
      )
    ).toThrow(/task_pause_ms/);
    expect(() =>
      parseScenario('[[token]]\nname = "t1"\n[[token.step]]\nelement = "Task_1"\npause_ms = -5\n')
    ).toThrow(/pause_ms/);
    expect(() =>
      parseScenario(
        '[[token]]\nname = "t1"\n[[token.step]]\nelement = "Task_1"\nwait_ms = "invalid"\n'
      )
    ).toThrow(/wait_ms/);
  });
});

describe('namedTokens', () => {
  test('autoincrements token numbers when not provided', () => {
    const tokens = namedTokens({
      token: [
        { name: 'first', step: [{ element: 'StartEvent_1' }] },
        { name: 'second', step: [{ element: 'StartEvent_1' }] },
      ],
    });
    expect(tokens[0].number).toBe(1);
    expect(tokens[1].number).toBe(2);
  });

  test('preserves explicit token numbers and handles token-N names', () => {
    const tokens = namedTokens({
      token: [
        { name: 'custom', number: 10, step: [{ element: 'StartEvent_1' }] },
        { name: 'token-5', step: [{ element: 'StartEvent_1' }] },
      ],
    });
    expect(tokens[0].number).toBe(10);
    expect(tokens[1].number).toBe(5);
  });
});

describe('exportScenarioTemplate', () => {
  test('covers the start event and gateway with its outgoing flow options', async () => {
    const template = await exportScenarioTemplate(gatewayXml);
    expect(template).toContain('element = "StartEvent_1"');
    expect(template).toContain('element = "Gateway_1"');
    expect(template).toContain('take = "Flow_approve"');
    expect(template).toContain('options: Flow_approve, Flow_reject');
    expect(template).toMatch(/\[\[token\]\]/);
    expect(template).toMatch(/\[\[token\.step\]\]/);
  });

  test('is valid TOML that round-trips through parseScenario', async () => {
    const template = await exportScenarioTemplate(gatewayXml);
    const scenario = parseScenario(template);
    expect(scenario.token?.length).toBeGreaterThan(0);
    expect(scenario.token?.[0].step.length).toBeGreaterThan(1);
  });

  test('collapses multi-line element labels so the generated TOML still parses', async () => {
    const template = await exportScenarioTemplate(multilineLabelXml);
    // None of the comment labels should have left a stray, un-prefixed line.
    for (const line of template.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      expect(trimmed.startsWith('#') || /^(fps|name|element|at_ms|take|\[)/.test(trimmed)).toBe(
        true
      );
    }
    expect(() => parseScenario(template)).not.toThrow();
  });
});

describe('renderScenarioFrames', () => {
  test('animates a token from start to end across multiple frames', async () => {
    const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 1500,
    });

    expect(frameDurationMs).toBeCloseTo(1000 / 12, 5);
    expect(frames.length).toBeGreaterThan(5);
    for (const frame of frames) {
      expect(frame.svg).toContain('<svg');
    }

    const tokenFrames = frames.filter((f) => tokenPositions(f.svg).length > 0);
    expect(tokenFrames.length).toBeGreaterThan(5);
    const firstToken = tokenPositions(tokenFrames[1].svg)[0];
    const lastToken = tokenPositions(tokenFrames[tokenFrames.length - 1].svg)[0];
    expect(firstToken).toBeDefined();
    expect(lastToken).toBeDefined();
    expect(Math.abs(lastToken.x - firstToken.x)).toBeGreaterThan(20);
  });

  test('animates parallel gateways (fork and join) through to the end event', async () => {
    const { frames } = await renderScenarioFrames(exampleXml);
    expect(frames.length).toBeGreaterThan(50);

    // Verify parallel fork: at some point there are 2 concurrent tokens
    const maxConcurrentTokens = Math.max(...frames.map((f) => tokenPositions(f.svg).length));
    expect(maxConcurrentTokens).toBe(2);

    // Verify waiting token at merging parallel gateway (stop/wait state)
    const framesWithWaitingTokens = frames.filter((f) => /<g class="bts-token-count"/.test(f.svg));
    expect(framesWithWaitingTokens.length).toBeGreaterThan(0);

    // Verify reaching the end event past the join gateway (x > 750)
    const endPositions = frames.flatMap((f) => tokenPositions(f.svg)).filter((p) => p.x > 750);
    expect(endPositions.length).toBeGreaterThan(0);
  });

  test('continues after a token waits at an intermediate timer event', async () => {
    const { frames } = await renderScenarioFrames(
      intermediateTimerXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_timer"

  [[token.step]]
  element = "TimerEvent_1"
  at_ms = 0
`,
      { tailMs: 100 }
    );

    const afterTimerPositions = frames
      .flatMap((frame) => tokenPositions(frame.svg))
      .filter((position) => position.x > 400);

    expect(afterTimerPositions.length).toBeGreaterThan(0);
  });

  test('pauses host task when a boundary event step is pending and fires boundary event', async () => {
    const { frames } = await renderScenarioFrames(
      boundaryEventXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "BoundaryEvent_1"
  at_ms = 0
`,
      { tailMs: 100 }
    );

    // EndEvent_boundary is at y: 220-256; EndEvent_normal is at y: 100-136
    const endPositions = frames
      .flatMap((frame) => tokenPositions(frame.svg))
      .filter((pos) => pos.x > 300);

    expect(endPositions.length).toBeGreaterThan(0);
    for (const pos of endPositions) {
      expect(pos.y).toBeGreaterThan(180);
    }
  });

  test('pauses at task with bouncing token when task_pause_ms is configured in scenario', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
task_pause_ms = 500

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`,
      { maxDurationMs: 5000, tailMs: 500 }
    );
    const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
    const lastFrame = frames[frames.length - 1];
    expect(lastFrame.atMs).toBeGreaterThanOrEqual(500);
    // The pause must actually resume: if it never does, the loop only stops
    // because it hit maxDurationMs, and the token count overlay never clears.
    expect(lastFrame.atMs).toBeLessThan(5000);
    expect(lastFrame.svg.includes('bts-token-count')).toBe(false);
  });

  test('pauses at a sub-process with bouncing token, and resumes into its contents', async () => {
    const { frames } = await renderScenarioFrames(
      subProcessXml,
      `
task_pause_ms = 500

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`,
      { maxDurationMs: 10000, tailMs: 500 }
    );
    const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
    const lastFrame = frames[frames.length - 1];
    // If the sub-process (or its inner task) pause never resumes, the loop
    // only stops because it hit maxDurationMs, and the token count overlay
    // never clears.
    expect(lastFrame.atMs).toBeLessThan(10000);
    expect(lastFrame.svg.includes('bts-token-count')).toBe(false);
  });

  test('pauses at task with bouncing token when step-level pause_ms is configured', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Task_1"
  pause_ms = 400
`
    );
    const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
  });

  test('step-level pause_ms = 0 overrides scenario-level task_pause_ms', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
task_pause_ms = 1000

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Task_1"
  pause_ms = 0
`
    );
    const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBe(0);
  });

  test('taskPauseMs in RenderScenarioOptions overrides scenario', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`,
      { taskPauseMs: 500 }
    );
    const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
  });

  test('bouncing token count animation is fully contained within the SVG viewBox across all frames and not cropped', async () => {
    // Test multiple diagram types with bouncing tokens (tasks, robot tasks, parallel gateways)
    const testCases = [
      {
        xml: sampleXml,
        scenario: `
task_pause_ms = 500

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`,
      },
      {
        xml: robotXml,
        scenario: `
task_pause_ms = 500

[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"
`,
      },
      {
        xml: exampleXml,
        scenario: undefined, // default scenario visits parallel join gateway which waits and bounces
      },
    ];

    for (const { xml, scenario } of testCases) {
      const { frames } = await renderScenarioFrames(xml, scenario);
      const countFrames = frames.filter((frame) => frame.svg.includes('bts-token-count'));
      expect(countFrames.length).toBeGreaterThan(0);

      for (const frame of countFrames) {
        const vbMatch = frame.svg.match(/viewBox="([^"]+)"/);
        expect(vbMatch).toBeDefined();
        const [vbX, vbY, vbW, vbH] = vbMatch![1].split(' ').map(Number);

        const tokenMatches = [
          ...frame.svg.matchAll(
            /<g class="bts-token-count" transform="translate\(([-\d.]+),\s*([-\d.]+)\)">/g
          ),
        ];
        expect(tokenMatches.length).toBeGreaterThan(0);

        for (const tokenMatch of tokenMatches) {
          const tokenX = Number(tokenMatch[1]);
          const tokenY = Number(tokenMatch[2]);
          // Token circle has r=12.5 (width=25, height=25)
          expect(tokenX).toBeGreaterThanOrEqual(vbX);
          expect(tokenX + 25).toBeLessThanOrEqual(vbX + vbW);
          expect(tokenY).toBeGreaterThanOrEqual(vbY);
          expect(tokenY + 25).toBeLessThanOrEqual(vbY + vbH);
        }
      }
    }
  });

  test('a gateway `take` step steers the token onto the configured branch', async () => {
    const { frames } = await renderScenarioFrames(
      gatewayXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Gateway_1"
  take = "Flow_reject"
`,
      { tailMs: 5000 }
    );

    // Task_reject sits below the gateway (y: 260-340); Task_approve sits
    // above it (y: 80-160) in the gateway.bpmn fixture.
    const positionsAfterGateway = frames
      .flatMap((f) => tokenPositions(f.svg))
      .filter((p) => p.x > 460);

    expect(positionsAfterGateway.length).toBeGreaterThan(0);
    for (const pos of positionsAfterGateway) {
      expect(pos.y).toBeGreaterThan(200);
    }
  });

  test('two concurrent tokens take different branches at the same gateway', async () => {
    const { frames } = await renderScenarioFrames(
      gatewayXml,
      `
[[token]]
name = "approved"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Gateway_1"
  take = "Flow_approve"

[[token]]
name = "rejected"

  [[token.step]]
  element = "StartEvent_1"
  at_ms = 100

  [[token.step]]
  element = "Gateway_1"
  take = "Flow_reject"
`,
      { tailMs: 6000 }
    );

    const positionsAfterGateway = frames
      .flatMap((f) => tokenPositions(f.svg))
      .filter((p) => p.x > 460);

    const approvedSide = positionsAfterGateway.some((p) => p.y < 200);
    const rejectedSide = positionsAfterGateway.some((p) => p.y > 200);
    expect(approvedSide).toBe(true);
    expect(rejectedSide).toBe(true);

    const gfxNumbers = frames.flatMap((f) => tokenGfxNumbers(f.svg));
    expect(gfxNumbers).toContain('1');
    expect(gfxNumbers).toContain('2');
  });

  test('autoincrements token numbers for multiple tokens', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
[[token]]
name = "first"

  [[token.step]]
  element = "StartEvent_1"

[[token]]
name = "second"

  [[token.step]]
  element = "StartEvent_1"
  at_ms = 400
`,
      { tailMs: 2000 }
    );

    const allTokenNumbers = frames.flatMap((f) => tokenGfxNumbers(f.svg));
    expect(allTokenNumbers).toContain('1');
    expect(allTokenNumbers).toContain('2');
  });

  test('renders autoincremented token numbers on waiting tokens', async () => {
    const { frames } = await renderScenarioFrames(
      intermediateTimerXml,
      `
[[token]]
name = "t1"

  [[token.step]]
  element = "StartEvent_timer"

  [[token.step]]
  element = "TimerEvent_1"
  at_ms = 2500

[[token]]
name = "t2"

  [[token.step]]
  element = "StartEvent_timer"
  at_ms = 400

  [[token.step]]
  element = "TimerEvent_1"
  at_ms = 3000
`,
      { tailMs: 500 }
    );

    const countNumbers = frames.flatMap((f) => tokenCountNumbers(f.svg));
    expect(countNumbers).toContain('1');
    expect(countNumbers).toContain('2');
  });

  test('respects explicit token numbers in scenario', async () => {
    const { frames } = await renderScenarioFrames(
      sampleXml,
      `
[[token]]
name = "custom"
number = 42

  [[token.step]]
  element = "StartEvent_1"
`,
      { tailMs: 1000 }
    );

    const numbers = frames.flatMap((f) => tokenGfxNumbers(f.svg));
    expect(numbers).toContain('42');
    expect(numbers).not.toContain('1');
  });

  test("the `fps` option overrides the scenario's own `fps`", async () => {
    const scenarioToml = `fps = 6\n${oneTokenScenario}`;

    const atScenarioFps = await renderScenarioFrames(sampleXml, scenarioToml, { tailMs: 1200 });
    expect(atScenarioFps.frameDurationMs).toBeCloseTo(1000 / 6, 5);

    const atOverriddenFps = await renderScenarioFrames(sampleXml, scenarioToml, {
      tailMs: 1200,
      fps: 24,
    });
    expect(atOverriddenFps.frameDurationMs).toBeCloseTo(1000 / 24, 5);
    expect(atOverriddenFps.frames.length).toBeGreaterThan(atScenarioFps.frames.length);
  });

  test("`smooth` renders at SMOOTH_FPS, overriding the scenario's own `fps`", async () => {
    const scenarioToml = `fps = 6\n${oneTokenScenario}`;
    const { frameDurationMs } = await renderScenarioFrames(sampleXml, scenarioToml, {
      tailMs: 500,
      smooth: true,
    });
    expect(frameDurationMs).toBeCloseTo(1000 / SMOOTH_FPS, 5);
  });

  test('an explicit `fps` wins over `smooth`', async () => {
    const { frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
      smooth: true,
      fps: 15,
    });
    expect(frameDurationMs).toBeCloseTo(1000 / 15, 5);
  });

  test('with neither `fps` nor `smooth` set, defaults to DEFAULT_FPS', async () => {
    const { frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
    });
    expect(frameDurationMs).toBeCloseTo(1000 / DEFAULT_FPS, 5);
  });

  test('rejects a scenario referencing an unknown element id', async () => {
    await expect(
      renderScenarioFrames(
        sampleXml,
        '[[token]]\nname = "t1"\n[[token.step]]\nelement = "NoSuchElement"\n'
      )
    ).rejects.toThrow(/NoSuchElement/);
  });

  test('rejects a token whose first step is not a start event', async () => {
    await expect(
      renderScenarioFrames(
        gatewayXml,
        '[[token]]\nname = "t1"\n[[token.step]]\nelement = "Gateway_1"\ntake = "Flow_approve"\n'
      )
    ).rejects.toThrow(/start-event/);
  });

  test("omitting the scenario renders the diagram's own default scenario", async () => {
    const { frames } = await renderScenarioFrames(gatewayXml, undefined, { tailMs: 3000 });
    expect(frames.length).toBeGreaterThan(5);

    // Default scenario takes the first outgoing flow (Flow_approve, the
    // "Yes"/upper branch) — the token should never be seen on the lower
    // ("No") branch past the gateway.
    const positionsAfterGateway = frames
      .flatMap((f) => tokenPositions(f.svg))
      .filter((p) => p.x > 460);
    expect(positionsAfterGateway.length).toBeGreaterThan(0);
    for (const pos of positionsAfterGateway) {
      expect(pos.y).toBeLessThan(200);
    }
  });

  test('reports simulate progress via onProgress', async () => {
    const ticks: number[] = [];
    const { frames } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
      onProgress: (p) => {
        expect(p.phase).toBe('simulate');
        ticks.push(p.current);
      },
    });
    expect(ticks).toEqual(Array.from({ length: frames.length }, (_, i) => i + 1));
  });
});

describe('framesToGif', () => {
  test('encodes rendered frames into a valid animated GIF', async () => {
    const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
    });

    const gif = framesToGif(frames, frameDurationMs);
    expect(Buffer.isBuffer(gif)).toBe(true);
    expect(gif.subarray(0, 3).toString('ascii')).toBe('GIF');
  });

  test('reports rasterize progress via onProgress', async () => {
    const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
    });
    const ticks: number[] = [];
    framesToGif(frames, frameDurationMs, { onProgress: (p) => ticks.push(p.current) });
    expect(ticks).toEqual(Array.from({ length: frames.length }, (_, i) => i + 1));
  });
});

describe('ffmpeg mp4/webp encoders', () => {
  test.skipIf(!isFfmpegAvailable())(
    'framesToMp4 produces an MP4 when ffmpeg is available',
    async () => {
      const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
        tailMs: 500,
      });
      const mp4 = framesToMp4(frames, frameDurationMs);
      // ISO base media file format: 'ftyp' box at byte offset 4.
      expect(mp4.subarray(4, 8).toString('ascii')).toBe('ftyp');
    }
  );

  test.skipIf(!isFfmpegAvailable())(
    'framesToWebp produces a WebP when ffmpeg is available',
    async () => {
      const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
        tailMs: 500,
      });
      const webp = framesToWebp(frames, frameDurationMs);
      expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  );

  test('framesToMp4 without ffmpeg throws a clear error', async () => {
    if (isFfmpegAvailable()) return; // covered by the success test above instead
    const { frames, frameDurationMs } = await renderScenarioFrames(sampleXml, oneTokenScenario, {
      tailMs: 500,
    });
    expect(() => framesToMp4(frames, frameDurationMs)).toThrow(/ffmpeg/);
  });
});

describe('renderScenarioToGif / renderScenarioToApng / renderScenarioToMp4', () => {
  test('renderScenarioToGif produces a GIF regardless of encoder availability', async () => {
    const gif = await renderScenarioToGif(sampleXml, oneTokenScenario, { tailMs: 500 });
    expect(gif.subarray(0, 3).toString('ascii')).toBe('GIF');
  });

  test('renderScenarioToGif respects the background option', async () => {
    const gif = await renderScenarioToGif(sampleXml, oneTokenScenario, {
      tailMs: 500,
      background: 'white',
    });
    expect(gif.subarray(0, 3).toString('ascii')).toBe('GIF');
  });

  test.skipIf(!isFfmpegAvailable())(
    'renderScenarioToApng produces an APNG when ffmpeg is available',
    async () => {
      const apng = await renderScenarioToApng(sampleXml, oneTokenScenario, { tailMs: 500 });
      expect(apng.subarray(1, 4).toString('ascii')).toBe('PNG');
    }
  );

  test.skipIf(!isFfmpegAvailable())(
    'renderScenarioToMp4 produces an MP4 with default background',
    async () => {
      const mp4 = await renderScenarioToMp4(sampleXml, oneTokenScenario, { tailMs: 500 });
      expect(mp4.subarray(4, 8).toString('ascii')).toBe('ftyp');
    }
  );

  test('renderScenarioToApng without ffmpeg throws a clear error', async () => {
    if (isFfmpegAvailable()) return; // covered by the APNG-success test above instead
    await expect(
      renderScenarioToApng(sampleXml, oneTokenScenario, { tailMs: 500 })
    ).rejects.toThrow(/ffmpeg/);
  });
});
