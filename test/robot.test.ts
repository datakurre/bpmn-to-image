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

  test('renderToSvg renders robot icon as native vector path for service tasks with robot in ID', async () => {
    const svg = await renderToSvg(robotXml);
    expect(svg).toContain('class="robot-icon"');
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<image');
  });

  test('renderToSvg does not render robot icon for non-robot tasks', async () => {
    const svg = await renderToSvg(sampleXml);
    expect(svg).not.toContain('class="robot-icon"');
  });

  test('renderToPng renders a diagram with robot task to a valid PNG buffer', async () => {
    const png = await renderToPng(robotXml);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.length).toBeGreaterThan(1000);
  });

  test('renderScenarioFrames includes robot icon as vector paths in animation frames', async () => {
    const result = await renderScenarioFrames(robotXml);
    expect(result.frames.length).toBeGreaterThan(0);
    for (const frame of result.frames) {
      expect(frame.svg).toContain('class="robot-icon"');
      expect(frame.svg).toContain('<path');
      expect(frame.svg).not.toContain('<image');
    }
  });

  test('renderScenarioFrames pauses at robot task with bouncing token and terminates promptly', async () => {
    const result = await renderScenarioFrames(robotXml);
    const countFrames = result.frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
    const lastFrame = result.frames[result.frames.length - 1];
    expect(lastFrame.atMs).toBeGreaterThanOrEqual(1000);
    expect(lastFrame.atMs).toBeLessThan(10000);
  });

  test('respects ROBOT_TASK_PAUSE_MS environment variable', async () => {
    process.env.ROBOT_TASK_PAUSE_MS = '0';
    try {
      const result = await renderScenarioFrames(robotXml);
      const countFrames = result.frames.filter((frame) => frame.svg.includes('bts-token-count'));
      expect(countFrames.length).toBe(0);
    } finally {
      delete process.env.ROBOT_TASK_PAUSE_MS;
    }
  });
});
