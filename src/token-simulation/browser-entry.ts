/**
 * Browser-bundle entry point for the token-simulation feature.
 *
 * `bpmn-js-token-simulation` ships as plain ESM source meant to be bundled
 * alongside `bpmn-js` (so both resolve the same internal `bpmn-js`/
 * `diagram-js` classes) — unlike `bpmn-js` itself, it has no prebuilt
 * browser dist. This file is the esbuild entry that produces one
 * (`dist/token-simulation-bundle.js`), analogous to bpmn-js's own
 * `dist/bpmn-modeler.development.js` that `headless-canvas.ts` already
 * evals into jsdom for plain rendering.
 *
 * Bundled (not `external`) here, so `BpmnModeler` and
 * `TokenSimulationBaseModule` share one copy of `bpmn-js`/`diagram-js`.
 */

import BpmnModeler from 'bpmn-js/lib/Modeler';
import TokenSimulationBaseModule from 'bpmn-js-token-simulation/lib/base';

(window as any).__TokenSimBpmnJS = { BpmnModeler, TokenSimulationBaseModule };
