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

  test('vertically centers the token number in the moving-token circle', () => {
    const overrides = readFileSync(
      join(__dirname, '../src/token-simulation/viewer-chrome-overrides.css'),
      'utf-8'
    );
    expect(overrides).toMatch(/\.bts-token \.bts-text\s*\{[^}]*dominant-baseline:\s*central/);
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
