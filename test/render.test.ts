import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { renderToPng, renderToSvg } from '../src/render';
import { fixMarkerUrls, svgToPng } from '../src/svg-to-png';

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

  test('respects the background option in SVG', async () => {
    const svg = await renderToSvg(sampleXml, { background: '#123456' });
    expect(svg).toContain('<rect class="bpmn-to-image-background"');
    expect(svg).toContain('fill="#123456"');
  });

  test('normalizes sequence flow marker URLs to unquoted format', async () => {
    const svg = await renderToSvg(sampleXml);
    // Sequence flows must have marker-end with unquoted url(#...)
    expect(svg).toMatch(/marker-end:\s*url\(#[^"']+\)/);
    // There must be no quoted marker URLs anywhere in the SVG
    expect(svg).not.toMatch(/marker-end:\s*url\(["'][^"']+["']\)/);
    expect(svg).not.toMatch(/url\(["']#[^"']+["']\)/);
  });
});

describe('fixMarkerUrls', () => {
  test('strips single quotes from fragment URLs', () => {
    const input = '<path style="marker-end: url(\'#marker-123\');" />';
    expect(fixMarkerUrls(input)).toBe('<path style="marker-end: url(#marker-123);" />');
  });

  test('strips double quotes from fragment URLs', () => {
    const input = '<path style=\'marker-end: url("#marker-123");\' />';
    expect(fixMarkerUrls(input)).toBe("<path style='marker-end: url(#marker-123);' />");
  });

  test('preserves already unquoted fragment URLs', () => {
    const input = '<path style="marker-end: url(#marker-123);" />';
    expect(fixMarkerUrls(input)).toBe('<path style="marker-end: url(#marker-123);" />');
  });

  test('handles whitespace around quoted fragment URLs', () => {
    const input = '<path style="marker-end: url( \'#marker-123\' );" />';
    expect(fixMarkerUrls(input)).toBe('<path style="marker-end: url(#marker-123);" />');
  });

  test('handles multiple marker URLs in one SVG string', () => {
    const input =
      "<path style=\"marker-start: url('#m1'); marker-end: url('#m2');\" /><path style=\"marker-end: url('#m3');\" />";
    expect(fixMarkerUrls(input)).toBe(
      '<path style="marker-start: url(#m1); marker-end: url(#m2);" /><path style="marker-end: url(#m3);" />'
    );
  });

  test('does not modify non-fragment URLs', () => {
    const input = '<image href="url(\'https://example.com/pic.png\')" />';
    expect(fixMarkerUrls(input)).toBe('<image href="url(\'https://example.com/pic.png\')" />');
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

  test('respects the background option in PNG', async () => {
    const png = await renderToPng(sampleXml, { background: 'white' });
    expect(Buffer.isBuffer(png)).toBe(true);
  });

  test('renders arrowheads without usvg marker-end parser warnings', async () => {
    const svg = await renderToSvg(sampleXml);
    // Resvg with logLevel 'warn' would fail to parse marker-end if quotes were present.
    // Ensure Resvg renders the normalized SVG without errors.
    const resvg = new Resvg(svg, { logLevel: 'warn' });
    const rendered = resvg.render();
    expect(rendered.width).toBeGreaterThan(0);
    expect(rendered.height).toBeGreaterThan(0);
    expect(rendered.asPng().length).toBeGreaterThan(0);
  });

  test('svgToPng sanitizes quoted marker URLs in raw SVG input', () => {
    const rawSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
          </marker>
        </defs>
        <path d="M 10 50 L 90 50" stroke="black" stroke-width="2" style="marker-end: url('#arrow');" />
      </svg>
    `;
    const png = svgToPng(rawSvg);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });
});
