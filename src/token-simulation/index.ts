/**
 * Animated BPMN execution rendering: drives bpmn-js-token-simulation
 * headlessly according to a TOML scenario and rasterizes the result as an
 * animated GIF.
 */

export {
  exportScenarioTemplate,
  parseScenario,
  type Scenario,
  type ScenarioTrigger,
} from './scenario';
export {
  renderScenarioFrames,
  type AnimationFrame,
  type RenderScenarioOptions,
  type RenderScenarioResult,
} from './simulate';
export { framesToGif, type FramesToGifOptions } from './gif';

import { framesToGif, type FramesToGifOptions } from './gif';
import { renderScenarioFrames, type RenderScenarioOptions } from './simulate';

/**
 * Render a BPMN diagram's token-simulation animation, driven by a TOML
 * scenario, straight to an animated GIF buffer.
 */
export async function renderScenarioToGif(
  xml: string,
  scenarioToml: string,
  options: RenderScenarioOptions & FramesToGifOptions = {}
): Promise<Buffer> {
  const { frames, frameDurationMs } = await renderScenarioFrames(xml, scenarioToml, options);
  return framesToGif(frames, frameDurationMs, options);
}
