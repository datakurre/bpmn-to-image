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

  test('renderScenarioFrames pauses at robot task with bouncing token and terminates promptly when configured in scenario', async () => {
    const result = await renderScenarioFrames(
      robotXml,
      `
task_pause_ms = 500

[[token]]
name = "token-1"

  [[token.step]]
  element = "StartEvent_1"
`
    );
    const countFrames = result.frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
    const lastFrame = result.frames[result.frames.length - 1];
    expect(lastFrame.atMs).toBeGreaterThanOrEqual(500);
    expect(lastFrame.atMs).toBeLessThan(10000);

    // Verify that the bouncing token is fully contained within the viewBox in all frames
    for (const frame of countFrames) {
      const vbMatch = frame.svg.match(/viewBox="([^"]+)"/);
      expect(vbMatch).toBeDefined();
      const [vbX, vbY, vbW, vbH] = vbMatch![1].split(' ').map(Number);
      const tokenMatch = frame.svg.match(
        /<g class="bts-token-count" transform="translate\(([-\d.]+),\s*([-\d.]+)\)">/
      );
      if (tokenMatch) {
        const tokenX = Number(tokenMatch[1]);
        const tokenY = Number(tokenMatch[2]);
        // Circle has radius 12.5, diameter 25
        expect(tokenX).toBeGreaterThanOrEqual(vbX);
        expect(tokenX + 25).toBeLessThanOrEqual(vbX + vbW);
        expect(tokenY).toBeGreaterThanOrEqual(vbY);
        expect(tokenY + 25).toBeLessThanOrEqual(vbY + vbH);
      }
    }
  });

  test('renderScenarioFrames pauses at robot task via step-level pause_ms', async () => {
    const result = await renderScenarioFrames(
      robotXml,
      `
[[token]]
name = "token-1"

  [[token.step]]
  element = "StartEvent_1"

  [[token.step]]
  element = "Activity_robot_task"
  pause_ms = 500
`
    );
    const countFrames = result.frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBeGreaterThan(0);
  });

  test('does not pause at robot task when no pause is configured in scenario', async () => {
    const result = await renderScenarioFrames(robotXml);
    const countFrames = result.frames.filter((frame) => frame.svg.includes('bts-token-count'));
    expect(countFrames.length).toBe(0);
  });

  test('keeps a label centered on its box when the box is widened to fit a word', () => {
    const renderer = new CustomTextRenderer();
    const svgText = (options: Record<string, unknown>) =>
      (renderer as any).createText('Submit', { box: { width: 10, height: 14 }, ...options });
    const firstX = (el: SVGElement) => parseFloat(el.querySelector('tspan')!.getAttribute('x')!);

    const widened = firstX(svgText({}));
    const left = firstX(svgText({ align: 'left-top' }));
    // A widened box is wider than 10px, so unshifted centered text would start
    // right of 0; after compensation it is centered on the original 10px box
    // (so it starts left of the box, at (10 - width) / 2).
    expect(widened).toBeLessThan(0);
    expect(left).toBe(0);
  });
});
