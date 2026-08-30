import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { framesToGif } from '../src/token-simulation/gif';
import { exportScenarioTemplate, parseScenario } from '../src/token-simulation/scenario';
import { renderScenarioFrames } from '../src/token-simulation/simulate';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');
const gatewayXml = readFileSync(join(__dirname, 'fixtures/gateway.bpmn'), 'utf-8');

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

describe('parseScenario', () => {
  test('parses fps and triggers', () => {
    const scenario = parseScenario(`
fps = 24

[[trigger]]
element = "StartEvent_1"
at_ms = 0

[[trigger]]
element = "Gateway_1"
take = "Flow_a"
`);
    expect(scenario.fps).toBe(24);
    expect(scenario.trigger).toHaveLength(2);
    expect(scenario.trigger?.[1]).toMatchObject({ element: 'Gateway_1', take: 'Flow_a' });
  });

  test('rejects a trigger without an element id', () => {
    expect(() => parseScenario('[[trigger]]\nat_ms = 0\n')).toThrow(/element/);
  });
});

describe('exportScenarioTemplate', () => {
  test('covers the start event and gateway with its outgoing flow options', async () => {
    const template = await exportScenarioTemplate(gatewayXml);
    expect(template).toContain('element = "StartEvent_1"');
    expect(template).toContain('element = "Gateway_1"');
    expect(template).toContain('take = "Flow_approve"');
    expect(template).toContain('options: Flow_approve, Flow_reject');
  });

  test('is valid TOML that round-trips through parseScenario', async () => {
    const template = await exportScenarioTemplate(gatewayXml);
    const scenario = parseScenario(template);
    expect(scenario.trigger?.length).toBeGreaterThan(0);
  });
});

describe('renderScenarioFrames', () => {
  test('animates a token from start to end across multiple frames', async () => {
    const { frames, frameDurationMs } = await renderScenarioFrames(
      sampleXml,
      '[[trigger]]\nelement = "StartEvent_1"\n',
      { tailMs: 1500 }
    );

    expect(frameDurationMs).toBeCloseTo(1000 / 12, 5);
    expect(frames.length).toBeGreaterThan(5);
    for (const frame of frames) {
      expect(frame.svg).toContain('<svg');
    }

    // the token should actually move between frames, not sit still
    const firstToken = tokenPositions(frames[2].svg)[0];
    const lastToken = tokenPositions(frames[frames.length - 3].svg)[0];
    expect(firstToken).toBeDefined();
    expect(lastToken).toBeDefined();
    expect(Math.abs(lastToken.x - firstToken.x)).toBeGreaterThan(20);
  });

  test('a gateway `take` trigger steers the token onto the configured branch', async () => {
    const { frames } = await renderScenarioFrames(
      gatewayXml,
      `
[[trigger]]
element = "StartEvent_1"

[[trigger]]
element = "Gateway_1"
take = "Flow_reject"
`,
      { tailMs: 5000 }
    );

    // Task_reject sits below the gateway (y: 260-340); Task_approve sits
    // above it (y: 80-160) in the gateway.bpmn fixture — so once the token
    // has passed the gateway it should be found only in the lower half.
    const positionsAfterGateway = frames
      .flatMap((f) => tokenPositions(f.svg))
      .filter((p) => p.x > 460); // past the gateway (x=395-445)

    expect(positionsAfterGateway.length).toBeGreaterThan(0);
    for (const pos of positionsAfterGateway) {
      expect(pos.y).toBeGreaterThan(200);
    }
  });

  test('rejects a scenario referencing an unknown element id', async () => {
    await expect(
      renderScenarioFrames(sampleXml, '[[trigger]]\nelement = "NoSuchElement"\n')
    ).rejects.toThrow(/NoSuchElement/);
  });
});

describe('framesToGif', () => {
  test('encodes rendered frames into a valid animated GIF', async () => {
    const { frames, frameDurationMs } = await renderScenarioFrames(
      sampleXml,
      '[[trigger]]\nelement = "StartEvent_1"\n',
      { tailMs: 500 }
    );

    const gif = framesToGif(frames, frameDurationMs);
    expect(Buffer.isBuffer(gif)).toBe(true);
    expect(gif.subarray(0, 3).toString('ascii')).toBe('GIF');
  });
});
