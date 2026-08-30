/**
 * Headless browser environment for bpmn-js + bpmn-js-token-simulation.
 *
 * Mirrors `../headless-canvas.ts`, but evaluates the browser bundle built
 * from `browser-entry.ts` (bpmn-js's `Modeler` bundled together with
 * `bpmn-js-token-simulation`'s `BaseModule`) instead of bpmn-js's own
 * prebuilt dist — see that file for why a separate bundle is needed.
 *
 * Uses its own jsdom instance (rather than sharing the plain renderer's
 * singleton) so a running simulation's patched `Date.now`/
 * `requestAnimationFrame` (see `virtual-clock.ts`) never leaks into plain
 * `renderToSvg`/`renderToPng` calls, or vice versa.
 */

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { applyPolyfills } from '../headless-polyfills';

let jsdomInstance: any;
let BpmnModelerCtor: any;
let TokenSimulationBaseModule: any;

function resolveBundlePath(): string {
  // Built alongside dist/index.js by esbuild.config.mjs. When running from
  // source (ts-node/vitest), __dirname is src/token-simulation/, so the
  // bundle is found via the sibling dist/ directory at the package root.
  const fromDist = path.resolve(__dirname, 'token-simulation-bundle.js');
  if (fs.existsSync(fromDist)) return fromDist;

  const fromSrc = path.resolve(__dirname, '..', '..', 'dist', 'token-simulation-bundle.js');
  if (fs.existsSync(fromSrc)) return fromSrc;

  throw new Error(
    '[bpmn-to-image] dist/token-simulation-bundle.js not found — run `npm run build` first.'
  );
}

/** Ensure the jsdom instance + polyfills exist and return the canvas element. */
export function createTokenSimulationCanvas(): HTMLElement {
  if (!jsdomInstance) {
    const bundle = fs.readFileSync(resolveBundlePath(), 'utf-8');

    jsdomInstance = new JSDOM("<!DOCTYPE html><html><body><div id='canvas'></div></body></html>", {
      runScripts: 'outside-only',
    });

    applyPolyfills(jsdomInstance);

    jsdomInstance.window.eval(bundle);

    const globals = (jsdomInstance.window as any).__TokenSimBpmnJS;
    BpmnModelerCtor = globals.BpmnModeler;
    TokenSimulationBaseModule = globals.TokenSimulationBaseModule;
  }

  return jsdomInstance.window.document.getElementById('canvas')!;
}

/** Return the lazily-loaded jsdom window backing the token-simulation canvas. */
export function getTokenSimulationWindow(): any {
  if (!jsdomInstance) createTokenSimulationCanvas();
  return jsdomInstance.window;
}

/** Return the lazily-loaded BpmnModeler constructor. */
export function getTokenSimulationBpmnModeler(): any {
  if (!BpmnModelerCtor) createTokenSimulationCanvas();
  return BpmnModelerCtor;
}

/** Return the lazily-loaded bpmn-js-token-simulation BaseModule. */
export function getTokenSimulationBaseModule(): any {
  if (!TokenSimulationBaseModule) createTokenSimulationCanvas();
  return TokenSimulationBaseModule;
}
