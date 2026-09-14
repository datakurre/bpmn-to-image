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
import RobotModule from '../robot';
import Animation from 'bpmn-js-token-simulation/lib/animation/Animation';
import TokenCount from 'bpmn-js-token-simulation/lib/features/token-count/TokenCount';

// Patch Animation to render the scope's token number instead of hardcoded '1'
const originalGetTokenSVG = (Animation as any).prototype._getTokenSVG;
(Animation as any).prototype._getTokenSVG = function (scope: any) {
  const svg: string = originalGetTokenSVG.call(this, scope);
  const tokenNumber = scope?.tokenNumber != null ? scope.tokenNumber : 1;
  return svg.replace(
    /(<text[^>]*class="[^"]*bts-text[^"]*"[^>]*>)\s*1\s*(<\/text>)/,
    `$1${tokenNumber}$2`
  );
};

// Patch TokenCount to display the scope's token number when waiting
const originalGetTokenHTML = (TokenCount as any).prototype._getTokenHTML;
(TokenCount as any).prototype._getTokenHTML = function (element: any, scope: any) {
  const html: string = originalGetTokenHTML.call(this, element, scope);
  const tokenNumber = scope?.tokenNumber;
  if (tokenNumber != null) {
    return html.replace(
      /(<div[^>]*class="[^"]*bts-token-count[^"]*"[^>]*>)\s*[\d.]+\s*(<\/div>)/,
      `$1${tokenNumber}$2`
    );
  }
  return html;
};

(window as any).__TokenSimBpmnJS = { BpmnModeler, TokenSimulationBaseModule, RobotModule };
