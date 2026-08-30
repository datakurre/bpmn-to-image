import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { framesToMp4, framesToWebp, isFfmpegAvailable } from '../src/token-simulation/ffmpeg';
import { framesToGif } from '../src/token-simulation/gif';
import { exportScenarioTemplate, parseScenario } from '../src/token-simulation/scenario';
import { renderScenarioFrames } from '../src/token-simulation/simulate';
import { renderScenarioToApng, renderScenarioToGif } from '../src/token-simulation';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');
const gatewayXml = readFileSync(join(__dirname, 'fixtures/gateway.bpmn'), 'utf-8');
const multilineLabelXml = readFileSync(join(__dirname, 'fixtures/multiline-label.bpmn'), 'utf-8');

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

    const firstToken = tokenPositions(frames[2].svg)[0];
    const lastToken = tokenPositions(frames[frames.length - 3].svg)[0];
    expect(firstToken).toBeDefined();
    expect(lastToken).toBeDefined();
    expect(Math.abs(lastToken.x - firstToken.x)).toBeGreaterThan(20);
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

describe('renderScenarioToGif / renderScenarioToApng', () => {
  test('renderScenarioToGif produces a GIF regardless of encoder availability', async () => {
    const gif = await renderScenarioToGif(sampleXml, oneTokenScenario, { tailMs: 500 });
    expect(gif.subarray(0, 3).toString('ascii')).toBe('GIF');
  });

  test.skipIf(!isFfmpegAvailable())(
    'renderScenarioToApng produces an APNG when ffmpeg is available',
    async () => {
      const apng = await renderScenarioToApng(sampleXml, oneTokenScenario, { tailMs: 500 });
      expect(apng.subarray(1, 4).toString('ascii')).toBe('PNG');
    }
  );

  test('renderScenarioToApng without ffmpeg throws a clear error', async () => {
    if (isFfmpegAvailable()) return; // covered by the APNG-success test above instead
    await expect(
      renderScenarioToApng(sampleXml, oneTokenScenario, { tailMs: 500 })
    ).rejects.toThrow(/ffmpeg/);
  });
});
