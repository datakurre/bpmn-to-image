/**
 * bpmn-to-image — library entry point.
 *
 * Renders BPMN 2.0 XML to SVG or PNG headlessly (jsdom + bpmn-js), with no
 * browser or Canvas / node-gyp build chain required.
 */

export { renderToSvg, renderToPng, type RenderOptions, type RenderToPngOptions } from './render';
export {
  svgToPng,
  svgToPngWithFallback,
  cropSvgToViewBox,
  tightenSvgViewBox,
  rasterizeSvg,
  type RasterizeOptions,
  type SvgToPngOptions,
} from './svg-to-png';
export { createModelerFromXml, type CreateModelerOptions } from './modeler';
export {
  exportScenarioTemplate,
  parseScenario,
  renderScenarioFrames,
  DEFAULT_FPS,
  SMOOTH_FPS,
  renderScenarioToGif,
  renderScenarioToApng,
  renderScenarioToMp4,
  renderScenarioToWebp,
  framesToGif,
  framesToGifWithFfmpeg,
  framesToApng,
  framesToMp4,
  framesToWebp,
  isFfmpegAvailable,
  type Scenario,
  type ScenarioStep,
  type ScenarioToken,
  type AnimationFrame,
  type RenderScenarioOptions,
  type RenderScenarioResult,
  type RenderScenarioToGifOptions,
  type FramesToGifOptions,
  type FfmpegEncodeOptions,
  type GifEncoder,
  type OnProgress,
  type RenderPhase,
  type RenderProgress,
} from './token-simulation';
