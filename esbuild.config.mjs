import { build, context, transformSync } from 'esbuild';
import fs from 'node:fs';

/**
 * Esbuild plugin to inline .svg assets as base64 data URLs.
 * Ensures standalone, valid SVG output compatible with XML parsers and resvg.
 * @type {import('esbuild').Plugin}
 */
const svgBase64Plugin = {
  name: 'svg-base64',
  setup(build) {
    build.onLoad({ filter: /\.svg$/ }, async (args) => {
      const content = await fs.promises.readFile(args.path);
      const base64 = content.toString('base64');
      return {
        contents: `export default "data:image/svg+xml;base64,${base64}";`,
        loader: 'js',
      };
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const nodeConfig = {
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outdir: 'dist',
  entryNames: '[name]',
  external: [
    'jsdom',
    'bpmn-js/dist/*',
    'bpmn-js-token-simulation',
    'bpmn-moddle',
    'camunda-bpmn-moddle',
    '@resvg/resvg-js',
    'gifenc',
    'smol-toml',
  ],
  plugins: [svgBase64Plugin],
};

/**
 * Browser-target bundle of bpmn-js's Modeler + bpmn-js-token-simulation,
 * evaluated into jsdom at runtime (see src/token-simulation/browser-entry.ts).
 * Bundled fully (nothing external) so both libraries share one copy of
 * bpmn-js/diagram-js, just like bpmn-js's own prebuilt dist bundle.
 */
/** @type {import('esbuild').BuildOptions} */
const tokenSimulationBrowserConfig = {
  entryPoints: ['src/token-simulation/browser-entry.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  outfile: 'dist/token-simulation-bundle.js',
  plugins: [svgBase64Plugin],
};

/**
 * Browser-target bundle of bpmn-js's NavigatedViewer + bpmn-js-token-simulation's
 * viewer module, for embedding a live, interactive simulator directly into a
 * real browser page (see `src/interactive.ts`). Minified: unlike the other
 * two bundles (npm package internals, never seen directly), this one is
 * inlined verbatim into every `--format html` / `renderInteractiveHtml`
 * output, so its size is the slide/page's size.
 */
/** @type {import('esbuild').BuildOptions} */
const tokenSimulationViewerConfig = {
  entryPoints: ['src/token-simulation/viewer-entry.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  minify: true,
  outfile: 'dist/token-simulation-viewer-bundle.js',
  plugins: [svgBase64Plugin],
};

const configs = [nodeConfig, tokenSimulationBrowserConfig, tokenSimulationViewerConfig];

/**
 * The CSS the interactive viewer bundle needs at runtime (bpmn-js's own
 * chrome plus bpmn-js-token-simulation's play/pause + token-count chrome),
 * concatenated and minified into a single asset shipped alongside the JS
 * bundle — like the JS bundle above, this is inlined verbatim into every
 * `--format html` / `renderInteractiveHtml` output.
 */
function buildViewerCss() {
  const css = [
    'node_modules/bpmn-js/dist/assets/diagram-js.css',
    'node_modules/bpmn-js/dist/assets/bpmn-js.css',
    'node_modules/bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css',
    'src/token-simulation/viewer-chrome-overrides.css',
  ]
    .map((path) => fs.readFileSync(path, 'utf-8'))
    .join('\n');
  const minified = transformSync(css, { loader: 'css', minify: true }).code;
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/token-simulation-viewer.css', minified);
}

const isWatch = process.argv.includes('--watch');

buildViewerCss();

if (isWatch) {
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('Watching for changes...');
} else {
  await Promise.all(configs.map((config) => build(config)));
}
