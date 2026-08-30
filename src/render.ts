/**
 * Public rendering API: BPMN 2.0 XML → SVG / PNG.
 */

import { createModelerFromXml, type CreateModelerOptions } from './modeler';
import { svgToPng, tightenSvgViewBox } from './svg-to-png';

export interface RenderOptions extends CreateModelerOptions {
  /** Background color (CSS color string, e.g. "white", "#FFFFFF"). Default: undefined (transparent). */
  background?: string;
}

export interface RenderToPngOptions extends RenderOptions {
  /** Pixel density multiplier passed to the SVG→PNG rasterizer. Default: 2. */
  scale?: number;
}

/**
 * Render BPMN 2.0 XML to an SVG string.
 *
 * Imports the XML into a headless bpmn-js modeler and exports it via
 * `saveSVG()`, tightening the viewBox to the diagram's actual content
 * bounds (shapes, labels, and connection waypoints).
 */
export async function renderToSvg(xml: string, options: RenderOptions = {}): Promise<string> {
  const modeler = await createModelerFromXml(xml, options);
  const { svg } = await modeler.saveSVG();
  const elementRegistry = modeler.get('elementRegistry');
  return tightenSvgViewBox(svg || '', elementRegistry.getAll(), undefined, options.background);
}

/**
 * Render BPMN 2.0 XML to a PNG buffer.
 *
 * Equivalent to `renderToSvg` followed by `svgToPng`.
 */
export async function renderToPng(xml: string, options: RenderToPngOptions = {}): Promise<Buffer> {
  const svg = await renderToSvg(xml, options);
  return svgToPng(svg, { scale: options.scale, background: options.background });
}
