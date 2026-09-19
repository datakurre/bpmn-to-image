import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  renderInteractiveAssetsHtml,
  renderInteractiveDiagramHtml,
  renderInteractiveHtml,
} from '../src/interactive';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');

describe('renderInteractiveAssetsHtml', () => {
  test('embeds the viewer CSS and JS bundle', () => {
    const html = renderInteractiveAssetsHtml();
    expect(html).toMatch(/^<style>/);
    expect(html).toContain('.bts-toggle-mode');
    expect(html).toContain('window.TokenSimulation');
  });

  test('hides the fixed control chrome, keeping only per-element buttons', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    const hidden = overrides.match(/\*\/\s*([\s\S]*?)\{\s*display:\s*none\s*!important;\s*\}/)?.[1] ?? '';
    for (const selector of [
      '.bts-toggle-mode',
      '.bts-palette',
      '.bts-log',
      '.bts-set-animation-speed',
      '.bts-notifications',
      '.bts-scopes',
    ]) {
      expect(hidden).toContain(selector);
    }
    // The per-element context-pad buttons and the required bpmn.io
    // attribution link must not be in the hidden-selector list (mentioning
    // them in the file's explanatory comment is fine).
    expect(hidden).not.toContain('.bts-context-pad');
    expect(hidden).not.toContain('.bjs-powered-by');
  });

  test('removes the "simulation active" border around the canvas', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toMatch(
      /\.bjs-container\.simulation \.djs-container,\s*\.bjs-container\.simulation\.paused \.djs-container,\s*\.bjs-container\.simulation\.warning \.djs-container\s*\{\s*box-shadow:\s*none\s*!important;\s*\}/
    );
  });

  test('hides only the "Finished" text, keeping its icon badge and the "Not supported" warning', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toMatch(
      /\.bts-element-notification\.success \.bts-text\s*\{\s*display:\s*none;\s*\}/
    );
    // The badge itself (icon + background) stays, as does the warning
    // notification's own text.
    expect(overrides).not.toMatch(/\.bts-element-notification\.success\s*\{\s*display:\s*none/);
    expect(overrides).not.toMatch(/\.bts-element-notification\.warning[^{]*\{[^}]*display:\s*none/);
  });

  test('vertically centers the token number in the moving-token circle', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toMatch(/\.bts-token \.bts-text\s*\{[^}]*dominant-baseline:\s*central/);
  });

  test('resets the embed root font-size so host-page slide scaling cannot inherit in', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toMatch(/\.bpmn-simulator\s*\{[^}]*font-size:\s*16px/);
  });

  test('styles the fit-to-view button', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toContain('.bpmn-simulator-fit');
  });

  test('ensures token-simulation color variables resolve on <html>', () => {
    const entry = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-entry.ts'),
      'utf-8'
    );
    // SimulationStyles reads these via getComputedStyle(document.documentElement)
    // — which comes back empty for our bundled `:root {}` block once it's
    // nested deep enough in a host page's own layout (observed with a Marp
    // deck's per-slide <svg><foreignObject> wrapping), silently collapsing
    // the "selected"/"not selected" gateway-flow coloring to one color.
    expect(entry).toContain('ensureSimulationStyleVars()');
    for (const name of [
      '--token-simulation-green-base-44',
      '--token-simulation-grey-base-40',
      '--token-simulation-grey-darken-30',
      '--token-simulation-grey-lighten-56',
      '--token-simulation-red-base-62',
      '--token-simulation-silver-base-97',
      '--token-simulation-silver-darken-94',
      '--token-simulation-white',
    ]) {
      expect(entry).toContain(name);
    }
  });

  test('assigns each independent token its own auto-incrementing number', () => {
    const entry = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-entry.ts'),
      'utf-8'
    );
    // Root scopes (no parent — a fresh token from a start event) get the
    // next number; scopes with a parent inherit the parent's number, so a
    // single token splitting at a gateway stays "the same" token.
    expect(entry).toContain("eventBus.on('tokenSimulation.simulator.createScope'");
    expect(entry).toMatch(/if\s*\(scope\.parent\)\s*\{[\s\S]*?}\s*else\s*\{\s*scope\.tokenNumber = nextTokenNumber\+\+;/);
    expect(entry).toContain("eventBus.on('tokenSimulation.resetSimulation'");
  });

  test('fits the diagram from element-registry bounds, not the rendered SVG', () => {
    const entry = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-entry.ts'),
      'utf-8'
    );
    // `canvas.zoom('fit-viewport')` never scales past 100%, leaving a
    // container much bigger than the diagram mostly empty. Setting the
    // viewbox to the diagram's own bounding box scales freely in both
    // directions instead — computed from `elementRegistry`, not
    // `canvas.getDefaultLayer().getBBox()`, which comes back empty (bpmn-js
    // draws each root element into its own plane-specific layer, not the
    // generic "base" layer `getDefaultLayer` fetches).
    expect(entry).toContain("computeDiagramBounds(viewer.get('elementRegistry'))");
    expect(entry).toContain('canvas.viewbox({');
  });

  test('centers the fit box instead of pinning the diagram to the top-left corner', () => {
    const entry = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-entry.ts'),
      'utf-8'
    );
    // `Canvas#viewbox` maps the given box's top-left corner straight to the
    // viewport origin with no centering of its own — passing it a box
    // matching the diagram's bounds but not the container's aspect ratio
    // would leave all the slack on one side. Expanding the requested box to
    // the container's own aspect ratio, centered on the diagram's midpoint,
    // avoids that.
    expect(entry).toContain('canvas.getSize()');
    expect(entry).toMatch(/x:\s*bbox\.x \+ bbox\.width \/ 2 - viewWidth \/ 2/);
    expect(entry).toMatch(/y:\s*bbox\.y \+ bbox\.height \/ 2 - viewHeight \/ 2/);
  });

  test('adds a fit-to-view button that re-runs the fit', () => {
    const entry = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-entry.ts'),
      'utf-8'
    );
    expect(entry).toContain("className = 'bpmn-simulator-fit'");
    expect(entry).toContain('fitDiagram(viewer)');
  });

  test('is cached across calls', () => {
    expect(renderInteractiveAssetsHtml()).toBe(renderInteractiveAssetsHtml());
  });
});

describe('renderInteractiveDiagramHtml', () => {
  test('embeds a container and a base64-encoded init call', () => {
    const html = renderInteractiveDiagramHtml(sampleXml);
    expect(html).toMatch(/<span id="bpmn-sim-[0-9a-f]+" class="bpmn-simulator"/);
    const match = html.match(/TokenSimulation\("([^"]+)",\s*"([^"]+)",\s*(\w+)\)/);
    expect(match).toBeDefined();
    const [, id, xmlBase64, background] = match!;
    expect(html).toContain(`id="${id}"`);
    expect(Buffer.from(xmlBase64, 'base64').toString('utf-8')).toBe(sampleXml);
    expect(background).toBe('undefined');
  });

  test('derives a deterministic id from the diagram content by default', () => {
    const first = renderInteractiveDiagramHtml(sampleXml);
    const second = renderInteractiveDiagramHtml(sampleXml);
    expect(first).toBe(second);
  });

  test('honors an explicit id and background', () => {
    const html = renderInteractiveDiagramHtml(sampleXml, {
      id: 'my-diagram',
      background: 'white',
    });
    expect(html).toContain('<span id="my-diagram"');
    expect(html).toContain('TokenSimulation("my-diagram"');
    expect(html).toContain('"white"');
  });
});

describe('renderInteractiveHtml', () => {
  test('includes the shared assets by default', () => {
    const html = renderInteractiveHtml(sampleXml);
    expect(html).toContain('window.TokenSimulation');
    expect(html).toContain('bpmn-simulator');
  });

  test('omits the shared assets when includeAssets is false', () => {
    const html = renderInteractiveHtml(sampleXml, { includeAssets: false });
    expect(html).not.toContain('window.TokenSimulation =');
    expect(html).toContain('bpmn-simulator');
  });
});
