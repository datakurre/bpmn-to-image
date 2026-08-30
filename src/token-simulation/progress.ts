/**
 * Progress reporting shared by the simulation loop (`simulate.ts`) and the
 * frame-rasterization loops (`gif.ts`, `ffmpeg.ts`) — lets a caller (the
 * CLI's terminal progress bar, or a library consumer's own UI) track a
 * multi-second GIF/APNG render without guessing at internals.
 */

/**
 * `'simulate'`  — driving the virtual clock and capturing one SVG frame per tick.
 * `'rasterize'` — converting captured SVG frames to raster pixels for encoding.
 */
export type RenderPhase = 'simulate' | 'rasterize';

export interface RenderProgress {
  phase: RenderPhase;
  /** 1-based index of the unit just completed. */
  current: number;
  total: number;
}

export type OnProgress = (progress: RenderProgress) => void;
