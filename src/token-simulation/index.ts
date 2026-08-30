/**
 * Animated BPMN execution rendering: drives bpmn-js-token-simulation
 * headlessly according to a TOML scenario of named tokens, and rasterizes
 * the result as an animated GIF or APNG.
 */

export {
  exportScenarioTemplate,
  parseScenario,
  type Scenario,
  type ScenarioStep,
  type ScenarioToken,
} from './scenario';
export {
  renderScenarioFrames,
  DEFAULT_FPS,
  SMOOTH_FPS,
  type AnimationFrame,
  type RenderScenarioOptions,
  type RenderScenarioResult,
} from './simulate';
export { framesToGif, type FramesToGifOptions } from './gif';
export {
  framesToGifWithFfmpeg,
  framesToApng,
  framesToMp4,
  framesToWebp,
  isFfmpegAvailable,
  type FfmpegEncodeOptions,
} from './ffmpeg';
export type { OnProgress, RenderPhase, RenderProgress } from './progress';

import {
  framesToApng,
  framesToGifWithFfmpeg,
  framesToMp4,
  framesToWebp,
  isFfmpegAvailable,
  type FfmpegEncodeOptions,
} from './ffmpeg';
import { framesToGif, type FramesToGifOptions } from './gif';
import { renderScenarioFrames, type AnimationFrame, type RenderScenarioOptions } from './simulate';

/** Which GIF encoder to use. `'auto'` (default) prefers ffmpeg when it's on PATH, falling back to the pure-JS `gifenc` otherwise. */
export type GifEncoder = 'auto' | 'gifenc' | 'ffmpeg';

export interface RenderScenarioToGifOptions
  extends RenderScenarioOptions, FramesToGifOptions, FfmpegEncodeOptions {
  encoder?: GifEncoder;
}

function encodeGif(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: RenderScenarioToGifOptions
): Buffer {
  const encoder = options.encoder ?? 'auto';
  const useFfmpeg = encoder === 'ffmpeg' || (encoder === 'auto' && isFfmpegAvailable());

  if (encoder === 'ffmpeg' && !isFfmpegAvailable()) {
    throw new Error(
      '[bpmn-to-image] encoder "ffmpeg" requested but ffmpeg is not on PATH — install it, ' +
        'use the Nix devShell/package, or drop `encoder` to fall back to gifenc automatically.'
    );
  }

  return useFfmpeg
    ? framesToGifWithFfmpeg(frames, frameDurationMs, options)
    : framesToGif(frames, frameDurationMs, options);
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a TOML
 * scenario, straight to an animated GIF buffer. Uses ffmpeg's two-pass
 * palette encoder when available (better color quality), falling back to
 * the bundled pure-JS `gifenc` otherwise — see `encoder` to force one or
 * the other.
 *
 * `scenarioToml` is optional — omit it to render the diagram's own default
 * scenario (see `exportScenarioTemplate`).
 */
export async function renderScenarioToGif(
  xml: string,
  scenarioToml?: string,
  options: RenderScenarioToGifOptions = {}
): Promise<Buffer> {
  const { frames, frameDurationMs } = await renderScenarioFrames(xml, scenarioToml, options);
  return encodeGif(frames, frameDurationMs, options);
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a TOML
 * scenario, straight to an animated PNG (APNG) buffer — 24-bit color and
 * real alpha, unlike GIF's 256-color palette. Requires ffmpeg on PATH
 * (`gifenc` cannot produce APNG); throws a clear error otherwise.
 *
 * `scenarioToml` is optional — omit it to render the diagram's own default
 * scenario (see `exportScenarioTemplate`).
 */
export async function renderScenarioToApng(
  xml: string,
  scenarioToml?: string,
  options: RenderScenarioOptions & FfmpegEncodeOptions = {}
): Promise<Buffer> {
  const { frames, frameDurationMs } = await renderScenarioFrames(xml, scenarioToml, options);
  return framesToApng(frames, frameDurationMs, options);
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a TOML
 * scenario, straight to an MP4 (H.264) buffer — much smaller than GIF/APNG
 * for sharing, at the cost of not auto-playing everywhere a GIF does.
 * Requires ffmpeg on PATH; throws a clear error otherwise.
 *
 * `scenarioToml` is optional — omit it to render the diagram's own default
 * scenario (see `exportScenarioTemplate`).
 */
export async function renderScenarioToMp4(
  xml: string,
  scenarioToml?: string,
  options: RenderScenarioOptions & FfmpegEncodeOptions = {}
): Promise<Buffer> {
  const { frames, frameDurationMs } = await renderScenarioFrames(xml, scenarioToml, options);
  return framesToMp4(frames, frameDurationMs, options);
}

/**
 * Render a BPMN diagram's token-simulation animation, driven by a TOML
 * scenario, straight to an animated WebP buffer — smaller than GIF at
 * comparable quality. Requires ffmpeg on PATH; throws a clear error
 * otherwise.
 *
 * `scenarioToml` is optional — omit it to render the diagram's own default
 * scenario (see `exportScenarioTemplate`).
 */
export async function renderScenarioToWebp(
  xml: string,
  scenarioToml?: string,
  options: RenderScenarioOptions & FfmpegEncodeOptions = {}
): Promise<Buffer> {
  const { frames, frameDurationMs } = await renderScenarioFrames(xml, scenarioToml, options);
  return framesToWebp(frames, frameDurationMs, options);
}
