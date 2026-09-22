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

/**
 * bpmn-js-token-simulation's `SimulationStyles` (used to color the
 * "selected"/"not selected" outgoing flow at an exclusive/inclusive
 * gateway, the default token color, ...) reads its colors via
 * `getComputedStyle(document.documentElement).getPropertyValue(name)` —
 * i.e. it needs these custom properties to resolve on `<html>` itself, not
 * merely inherit down to wherever the diagram happens to sit. That holds on
 * an ordinary page, but doesn't reliably hold once this embed's `:root {}`
 * block (from `viewer-chrome-overrides.css`'s bundled copy of
 * bpmn-js-token-simulation's own CSS) ends up deep inside a host page's own
 * complex layout (a Marp/marpit deck's per-slide `<svg><foreignObject>`
 * wrapping, observed in practice, is one such case) — `getComputedStyle`
 * on a descendant of that `:root` rule still resolves fine, `<html>` itself
 * comes back empty, and every gateway's outgoing flows end up drawn in the
 * same color. Setting these directly as inline styles on `<html>` sidesteps
 * whatever cascade quirk causes that, and only fills in names the host
 * page hasn't already resolved.
 */
function ensureSimulationStyleVars(): void {
  const defaults: Record<string, string> = {
    '--token-simulation-green-base-44': '#10D070',
    '--token-simulation-grey-base-40': '#666666',
    '--token-simulation-grey-darken-30': '#212121',
    '--token-simulation-grey-lighten-56': '#909090',
    '--token-simulation-red-base-62': '#FF3D3D',
    '--token-simulation-silver-base-97': '#F8F8F8',
    '--token-simulation-silver-darken-94': '#EFEFEF',
    '--token-simulation-white': '#FFFFFF',
  };
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  for (const [name, value] of Object.entries(defaults)) {
    if (!computed.getPropertyValue(name).trim()) {
      root.style.setProperty(name, value);
    }
  }
}

ensureSimulationStyleVars();

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

const FIT_PADDING = 10;

/**
 * The diagram's bounding box, from the model (each element's own x/y/width/
 * height and each connection's waypoints) rather than the rendered SVG.
 * `canvas.getDefaultLayer().getBBox()` looks like the obvious way to get
 * this, but bpmn-js draws each root element (the process, a collaboration's
 * participants, ...) into its own plane-specific layer — `getDefaultLayer`
 * fetches a generic "base" layer that a plain BPMN diagram never actually
 * draws into, so its `getBBox()` comes back empty. Reading straight from
 * `elementRegistry` sidesteps that (and matches what the headless
 * renderer's own `computeElementBounds` does for the static SVG/PNG export,
 * for the same reason).
 */
function computeDiagramBounds(
  elementRegistry: any
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const grow = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const el of elementRegistry.getAll()) {
    // The process plane is a root container whose bounds mirror the viewport,
    // not the actual process content. Including it can make fit-to-view crop
    // descendants that extend beyond the first row of elements.
    if (!el.parent || el.type === 'bpmn:Process' || el.type === 'bpmn:Collaboration') continue;
    if (el.waypoints) {
      for (const wp of el.waypoints) {
        grow(wp.x, wp.y);
      }
    } else if (el.x != null && el.y != null && el.width && el.height) {
      grow(el.x, el.y);
      grow(el.x + el.width, el.y + el.height);
    }
  }

  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * `canvas.zoom('fit-viewport')` never scales *up* past 100% (see
 * diagram-js's `Canvas#_fitViewport`) — sensible for its usual case (a
 * viewer roughly diagram-sized), but our container is often much bigger
 * than the diagram (a full slide), leaving most of it as padding. Setting
 * the viewbox directly to the diagram's own bounding box has no such cap —
 * `Canvas#viewbox` scales freely in either direction — so the diagram
 * always fills the container, same as the static SVG/image render's
 * `object-fit: contain`.
 *
 * `Canvas#viewbox` itself doesn't center, though: it maps the given box's
 * top-left corner straight to the viewport's origin, so a box with a
 * different aspect ratio than the container leaves all the slack on one
 * side (bottom or right) instead of split evenly — the diagram reads as
 * pinned to the top-left. Expanding the box to the container's own aspect
 * ratio first, centered on the diagram's midpoint, makes `Canvas#viewbox`'s
 * own scale calculation exact in both dimensions at once, so there's no
 * leftover slack to land unevenly.
 */
function fitDiagram(viewer: any): void {
  const canvas = viewer.get('canvas');
  const djsContainer = canvas.getContainer();
  const bjsContainer = djsContainer?.parentElement as HTMLElement | null;
  const hostContainer = bjsContainer?.parentElement as HTMLElement | null;
  if (bjsContainer && hostContainer?.clientHeight) {
    // Percentage heights resolve against the foreignObject's intrinsic SVG
    // height in Marp, not the embed's available height. Set the measured host
    // height explicitly before asking diagram-js for its viewport size.
    const hostHeight = `${hostContainer.clientHeight}px`;
    bjsContainer.style.setProperty('height', hostHeight, 'important');
    djsContainer.style.setProperty('height', hostHeight, 'important');
    canvas.resized();
  }
  const bbox = computeDiagramBounds(viewer.get('elementRegistry'));
  if (!bbox || !bbox.width || !bbox.height) return;

  const outer = canvas.getSize();
  if (!outer.width || !outer.height) return;

  const paddedWidth = bbox.width + FIT_PADDING * 2;
  const paddedHeight = bbox.height + FIT_PADDING * 2;
  const scale = Math.min(outer.width / paddedWidth, outer.height / paddedHeight);
  const viewWidth = outer.width / scale;
  const viewHeight = outer.height / scale;

  canvas.viewbox({
    x: bbox.x + bbox.width / 2 - viewWidth / 2,
    y: bbox.y + bbox.height / 2 - viewHeight / 2,
    width: viewWidth,
    height: viewHeight,
  });
}

const FIT_ICON =
  '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5V7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13M13 17h2.5a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>';

/** A small "fit to view" button — re-runs `fitDiagram` on demand, e.g. after panning/zooming around during a demo. */
function addFitButton(container: HTMLElement, viewer: any): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bpmn-simulator-fit';
  button.title = 'Fit diagram to view';
  button.setAttribute('aria-label', 'Fit diagram to view');
  button.innerHTML = FIT_ICON;
  button.addEventListener('click', () => fitDiagram(viewer));
  container.appendChild(button);
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
      if (container) {
        addFitButton(container, viewer);
      }
      // Switch straight into simulation ("run") mode — matches opening the
      // diagram with no manual toggle click required.
      const toggle = container?.querySelector<HTMLElement>('.bts-toggle-mode');
      if (toggle) {
        toggle.click();
      }
      // Entering simulation mode changes the viewer chrome and its measured
      // canvas size. Fit once more after that layout has settled so the
      // initial view matches the fit button's result.
      requestAnimationFrame(() => fitDiagram(viewer));
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
