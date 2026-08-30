import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderToPng, renderToSvg } from '../src/render';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');

describe('renderToSvg', () => {
  test('renders BPMN XML to an SVG document', async () => {
    const svg = await renderToSvg(sampleXml);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('</svg>');
  });

  test('tightens the viewBox to the diagram content bounds', async () => {
    const svg = await renderToSvg(sampleXml);
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
    expect(viewBox).toBeDefined();
    const [, , width, height] = viewBox!.split(' ').map(Number);
    // Diagram content spans roughly x:152-428, y:80-160 plus 10px padding.
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(400);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(150);
  });
});

describe('renderToPng', () => {
  test('renders BPMN XML to a PNG buffer', async () => {
    const png = await renderToPng(sampleXml);
    expect(Buffer.isBuffer(png)).toBe(true);
    // PNG signature
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test('respects the scale option', async () => {
    const png1x = await renderToPng(sampleXml, { scale: 1 });
    const png2x = await renderToPng(sampleXml, { scale: 2 });
    expect(png2x.length).toBeGreaterThan(png1x.length);
  });
});
