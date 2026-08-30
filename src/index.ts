/**
 * bpmn-to-image — library entry point.
 *
 * Renders BPMN 2.0 XML to SVG or PNG headlessly (jsdom + bpmn-js), with no
 * browser or Canvas / node-gyp build chain required.
 */

export { renderToSvg, renderToPng, type RenderOptions, type RenderToPngOptions } from './render';
export { svgToPng, svgToPngWithFallback, cropSvgToViewBox, tightenSvgViewBox } from './svg-to-png';
export { createModelerFromXml, type CreateModelerOptions } from './modeler';
export {
  exportScenarioTemplate,
  parseScenario,
  renderScenarioFrames,
  renderScenarioToGif,
  framesToGif,
  type Scenario,
  type ScenarioTrigger,
  type AnimationFrame,
  type RenderScenarioOptions,
  type RenderScenarioResult,
  type FramesToGifOptions,
} from './token-simulation';
