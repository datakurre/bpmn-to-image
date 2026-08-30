/**
 * Assemble rendered animation frames (SVG strings) into an animated GIF.
 *
 * Rasterizes each frame with the same @resvg/resvg-js pipeline as
 * `svgToPng`, then quantizes/encodes with `gifenc` (pure JS, no native
 * addon) — keeping the "no Canvas / node-gyp build chain" property this
 * package already has for static PNG output.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { rasterizeSvg } from '../svg-to-png';
import type { OnProgress } from './progress';
import type { AnimationFrame } from './simulate';

export interface FramesToGifOptions {
  /** Pixel density multiplier passed to the SVG rasterizer. Default: 1. */
  scale?: number;
  /** Max colors in the shared GIF palette (2-256). Default: 128. */
  maxColors?: number;
  /** GIF loop count: 0 = forever (default), -1 = play once. */
  repeat?: number;
  /** Called once per frame while rasterizing SVG frames to pixels. */
  onProgress?: OnProgress;
}

/**
 * Rasterize each SVG frame to RGBA, then encode them as a single animated
 * GIF using one shared color palette (quantized from the first frame — BPMN
 * diagrams use a small, mostly-static color set, so this keeps colors
 * consistent across frames without per-frame palette flicker).
 */
export function framesToGif(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FramesToGifOptions = {}
): Buffer {
  if (frames.length === 0) {
    throw new Error('[bpmn-to-image] cannot encode a GIF from zero frames');
  }

  const scale = options.scale ?? 1;
  const maxColors = options.maxColors ?? 128;
  const repeat = options.repeat ?? 0;

  const rasterized = frames.map(({ svg }, i) => {
    const rendered = rasterizeSvg(svg, scale);
    options.onProgress?.({ phase: 'rasterize', current: i + 1, total: frames.length });
    return { data: rendered.pixels, width: rendered.width, height: rendered.height };
  });

  const { width, height } = rasterized[0];
  const palette = quantize(rasterized[0].data, maxColors, { format: 'rgba4444' });

  const gif = GIFEncoder();
  const delay = Math.round(frameDurationMs);

  for (const frame of rasterized) {
    const index = applyPalette(frame.data, palette, 'rgba4444');
    gif.writeFrame(index, width, height, { palette, delay, repeat, transparent: false });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}
