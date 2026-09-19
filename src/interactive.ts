/**
 * Live, interactive BPMN simulator embed.
 *
 * Unlike the rest of this package (which renders a diagram or a token
 * simulation headlessly, at build time, into a static image or animation),
 * this packages the diagram XML together with a self-contained bundle of
 * bpmn-js's `NavigatedViewer` + bpmn-js-token-simulation's viewer module
 * (see `token-simulation/viewer-entry.ts`) into HTML that runs the
 * simulation live, in the viewer's own browser, once embedded in a page.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InteractiveViewerOptions {
  /**
   * DOM id for the container element. Defaults to a short hash of the XML,
   * so repeated builds of the same diagram produce identical output.
   */
  id?: string;
  /** Background color (CSS color string) applied to the container. */
  background?: string;
}

export interface InteractiveHtmlOptions extends InteractiveViewerOptions {
  /**
   * Include the shared `<style>` + `<script>` bundle inline. Default: true.
   * Set to false when the assets have already been emitted once elsewhere
   * on the page (see `renderInteractiveAssetsHtml`) and only the small
   * per-diagram container + init call is needed.
   */
  includeAssets?: boolean;
}

function resolveDistAsset(name: string): string {
  // Built by esbuild.config.mjs alongside dist/index.js and dist/cli.js.
  // When running from source (ts-node/vitest), __dirname is src/, so the
  // asset is found via the sibling dist/ directory at the package root.
  const fromDist = path.resolve(__dirname, name);
  if (fs.existsSync(fromDist)) return fromDist;

  const fromSrc = path.resolve(__dirname, '..', 'dist', name);
  if (fs.existsSync(fromSrc)) return fromSrc;

  throw new Error(`[bpmn-to-image] dist/${name} not found — run \`npm run build\` first.`);
}

function readDistAsset(name: string): string {
  return fs.readFileSync(resolveDistAsset(name), 'utf-8');
}

let cachedAssetsHtml: string | undefined;

/**
 * The shared `<style>` + `<script>` block: bpmn-js/diagram-js/token-simulation
 * CSS plus the `window.TokenSimulation` bundle. Emit this once per page,
 * before any `renderInteractiveDiagramHtml` output.
 */
export function renderInteractiveAssetsHtml(): string {
  if (cachedAssetsHtml === undefined) {
    const css = readDistAsset('token-simulation-viewer.css');
    const js = readDistAsset('token-simulation-viewer-bundle.js');
    cachedAssetsHtml = `<style>\n${css}\n</style>\n<script>\n${js}\n</script>`;
  }
  return cachedAssetsHtml;
}

function defaultId(xml: string): string {
  return 'bpmn-sim-' + crypto.createHash('sha1').update(xml).digest('hex').slice(0, 12);
}

/**
 * The small per-diagram fragment: a container element plus the init call
 * that decodes and imports the diagram XML into it. Assumes
 * `renderInteractiveAssetsHtml`'s bundle is already present on the page.
 *
 * The container is a `<span>` (styled `display:block`), not a `<div>` —
 * bpmn-js only needs a DOM node to measure and attach to, and a `<span>` is
 * phrasing content, so it (and the `<script>` that follows it) can sit
 * inside a host page's `<p>` — e.g. one Markdown-to-HTML pipeline produces
 * around a lone embed — without an HTML parser closing that `<p>` early, as
 * it would for a block-level `<div>`.
 */
export function renderInteractiveDiagramHtml(
  xml: string,
  options: InteractiveViewerOptions = {}
): string {
  const id = options.id ?? defaultId(xml);
  const xmlBase64 = Buffer.from(xml, 'utf-8').toString('base64');
  const background = options.background ? JSON.stringify(options.background) : 'undefined';
  return [
    `<span id="${id}" class="bpmn-simulator" style="display:block;width:100%;min-height:400px;"></span>`,
    `<script>TokenSimulation(${JSON.stringify(id)}, ${JSON.stringify(xmlBase64)}, ${background});</script>`,
  ].join('\n');
}

/**
 * A fully self-contained interactive embed: the shared assets followed by
 * the per-diagram fragment. Pass `includeAssets: false` to omit the shared
 * assets when embedding more than one diagram on the same page.
 */
export function renderInteractiveHtml(xml: string, options: InteractiveHtmlOptions = {}): string {
  const assets = options.includeAssets === false ? '' : renderInteractiveAssetsHtml() + '\n';
  return assets + renderInteractiveDiagramHtml(xml, options);
}
