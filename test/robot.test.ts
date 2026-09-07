import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderToPng, renderToSvg } from '../src/render';
import { renderScenarioFrames } from '../src/token-simulation/simulate';
import robotModule, { RobotTaskRenderer, CustomTextRenderer } from '../src/robot';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');
const robotXml = readFileSync(join(__dirname, 'fixtures/robot.bpmn'), 'utf-8');

describe('robot plugin', () => {
  test('exports module definitions properly', () => {
    expect(robotModule.__init__).toContain('RobotTaskRenderer');
    expect(robotModule.RobotTaskRenderer).toEqual(['type', RobotTaskRenderer]);
    expect(robotModule.textRenderer).toEqual(['type', CustomTextRenderer]);
  });

  test('renderToSvg renders robot icon for service tasks with robot in ID', async () => {
    const svg = await renderToSvg(robotXml);
    expect(svg).toContain('<image');
    expect(svg).toMatch(/<image[^>]*width="32"[^>]*height="32"/);
    expect(svg).toContain('data:image/svg+xml');
  });

  test('renderToSvg does not render robot icon for non-robot tasks', async () => {
    const svg = await renderToSvg(sampleXml);
    expect(svg).not.toContain('<image');
  });

  test('renderToPng renders a diagram with robot task to a valid PNG buffer', async () => {
    const png = await renderToPng(robotXml);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.length).toBeGreaterThan(1000);
  });

  test('renderScenarioFrames includes robot icon in animation frames', async () => {
    const result = await renderScenarioFrames(robotXml);
    expect(result.frames.length).toBeGreaterThan(0);
    for (const frame of result.frames) {
      expect(frame.svg).toContain('<image');
      expect(frame.svg).toMatch(/<image[^>]*width="32"[^>]*height="32"/);
      expect(frame.svg).toContain('data:image/svg+xml');
    }
  });
});
