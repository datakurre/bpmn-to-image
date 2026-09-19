/**
 * Browser-bundle entry for the live, interactive simulator embed.
 *
 * Unlike `browser-entry.ts` (evaluated inside jsdom to render static frames
 * with the full editing `Modeler`), this bundles the read-only
 * `NavigatedViewer` with the token-simulation *viewer* module — pan/zoom
 * plus a play/pause toggle, no palette or editing — for embedding directly
 * into a real browser page (see `../interactive.ts`, which packages this
 * bundle together with the diagram XML into a self-contained HTML snippet).
 *
 * Produces `dist/token-simulation-viewer-bundle.js`, which defines a single
 * global, `window.TokenSimulation(containerId, xmlBase64, background?)`.
 */

import BpmnViewer from 'bpmn-js/lib/NavigatedViewer';
import TokenSimulationModule from 'bpmn-js-token-simulation/lib/viewer';
import Animation from 'bpmn-js-token-simulation/lib/animation/Animation';
import TokenCount from 'bpmn-js-token-simulation/lib/features/token-count/TokenCount';
import RobotModule from '../robot';
import { patchTokenNumberDisplay } from './token-number-patch';

patchTokenNumberDisplay(Animation as any, TokenCount as any);

function base64ToUtf8(base64: string): string {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * bpmn-js-token-simulation's own scopes carry no notion of "which
 * concurrent token is this" — `patchTokenNumberDisplay` only *displays*
 * `scope.tokenNumber`; something has to set it. The headless renderer's
 * `simulate.ts` does that from a scenario's named tokens; here, driven live
 * by clicks rather than a scripted scenario, tokens have no names — so each
 * root scope (no parent, i.e. a new token from a start event) just gets the
 * next auto-incrementing number, inherited by every scope descending from
 * it, mirroring `simulate.ts`'s own fallback for untracked tokens.
 */
function installTokenNumbering(viewer: any): void {
  const eventBus = viewer.get('eventBus');
  let nextTokenNumber = 1;

  eventBus.on('tokenSimulation.simulator.createScope', ({ scope }: { scope: any }) => {
    if (!scope) return;
    if (scope.parent) {
      const parentNumber = scope.parent.tokenNumber;
      if (parentNumber != null) {
        scope.tokenNumber = parentNumber;
      }
    } else {
      scope.tokenNumber = nextTokenNumber++;
    }
  });

  eventBus.on('tokenSimulation.resetSimulation', () => {
    nextTokenNumber = 1;
  });
}

function openDiagram(containerId: string, xml: string, background?: string): Promise<void> {
  const container = document.getElementById(containerId);
  if (container && background) {
    (container.style as CSSStyleDeclaration).background = background;
  }

  const viewer = new (BpmnViewer as any)({
    container: '#' + containerId,
    additionalModules: [TokenSimulationModule, RobotModule],
  });

  installTokenNumbering(viewer);

  return viewer
    .importXML(xml)
    .then(({ warnings }: { warnings: string[] }) => {
      if (warnings && warnings.length) {
        console.log(warnings);
      }
      viewer.get('canvas').zoom('fit-viewport', true);
      // Switch straight into simulation ("run") mode — matches opening the
      // diagram with no manual toggle click required.
      const toggle = container?.querySelector<HTMLElement>('.bts-toggle-mode');
      if (toggle) {
        toggle.click();
      }
    })
    .catch((err: unknown) => {
      console.error(err);
    });
}

(window as any).TokenSimulation = function (
  containerId: string,
  xmlBase64: string,
  background?: string
): Promise<void> {
  return openDiagram(containerId, base64ToUtf8(xmlBase64), background);
};
