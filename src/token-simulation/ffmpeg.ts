/**
 * Optional ffmpeg-based encoders for animation frames: better GIF quality
 * (two-pass palette generation) than the pure-JS `gifenc` fallback, plus
 * three formats `gifenc` can't produce at all — APNG (24-bit color + real
 * alpha), MP4 (much smaller, for sharing), and animated WebP.
 *
 * ffmpeg is not an npm dependency — this package still installs and works
 * with plain `npm install` alone. It's an *optional* enhancement, detected
 * at runtime via `isFfmpegAvailable()`, that only shows up when ffmpeg is
 * actually on `PATH` — which the Nix flake in this repo provisions (the
 * devShell, and the packaged CLI via a wrapped PATH) but a plain `npm
 * install` does not. See `gif.ts` for the always-available GIF fallback.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rasterizeSvg } from '../svg-to-png';
import type { OnProgress } from './progress';
import type { AnimationFrame } from './simulate';

let cachedAvailability: boolean | null = null;

/**
 * Whether `ffmpeg` is available on `PATH`. Result is cached for the process
 * lifetime — pass `force: true` to re-probe (mainly for tests).
 */
export function isFfmpegAvailable(force = false): boolean {
  if (force || cachedAvailability === null) {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    cachedAvailability = result.error === undefined && result.status === 0;
  }
  return cachedAvailability;
}

export interface FfmpegEncodeOptions {
  /** Pixel density multiplier passed to the SVG rasterizer. Default: 1. */
  scale?: number;
  /** Background color (CSS color string, e.g. "white", "#FFFFFF"). Default: "white" for MP4 (formats without transparency support), undefined (transparent) for others. */
  background?: string;
  /** Called once per frame while rasterizing SVG frames to pixels, ahead of the ffmpeg encode itself. */
  onProgress?: OnProgress;
}

type FfmpegFormat = 'gif' | 'apng' | 'mp4' | 'webp';

function rasterizeFramesToDir(
  frames: AnimationFrame[],
  scale: number,
  background: string | undefined,
  dir: string,
  onProgress?: OnProgress
): void {
  for (const [i, frame] of frames.entries()) {
    const png = rasterizeSvg(frame.svg, { scale, background }).asPng();
    writeFileSync(join(dir, `frame_${String(i).padStart(5, '0')}.png`), png);
    onProgress?.({ phase: 'rasterize', current: i + 1, total: frames.length });
  }
}

/**
 * Format-specific ffmpeg output args, tuned for small file size on this
 * package's content (flat-color vector diagrams, a mostly-static
 * background with one small moving token):
 *
 * - GIF: `palettegen=stats_mode=diff` builds the palette from *changed*
 *   pixels across frames rather than each frame's absolute colors (a
 *   static background needs far fewer palette slots than the moving
 *   token), and `paletteuse=dither=none` avoids dithering noise that both
 *   looks wrong on flat color fills and compresses far worse than a flat
 *   run of identical pixels.
 * - APNG: `-pred mixed` picks the smallest PNG spatial filter per row
 *   instead of one fixed filter for the whole image.
 * - MP4: `-pix_fmt yuv420p` for broad player compatibility, which
 *   requires even width/height (the scale filter rounds down to the
 *   nearest even pixel); `-movflags +faststart` moves metadata to the
 *   front for progressive playback.
 * - WebP: lossy (`-lossless 0`) at a high quality/compression trade-off —
 *   still far smaller than an equivalent GIF for this content.
 */
function formatArgs(format: FfmpegFormat): string[] {
  switch (format) {
    case 'gif':
      return [
        '-lavfi',
        'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=none',
        '-loop',
        '0',
      ];
    case 'apng':
      return ['-plays', '0', '-pred', 'mixed'];
    case 'mp4':
      return [
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'medium',
        '-movflags',
        '+faststart',
      ];
    case 'webp':
      return ['-loop', '0', '-lossless', '0', '-q:v', '80', '-compression_level', '6', '-an'];
  }
}

function runFfmpeg(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions,
  format: FfmpegFormat
): Buffer {
  if (frames.length === 0) {
    throw new Error(`[bpmn-to-image] cannot encode a ${format.toUpperCase()} from zero frames`);
  }
  if (!isFfmpegAvailable()) {
    throw new Error(
      '[bpmn-to-image] ffmpeg not found on PATH — install it, or use the Nix devShell/package ' +
        '(flake.nix provisions it)' +
        (format === 'gif' ? ', or render a GIF via framesToGif() instead.' : '.')
    );
  }

  const scale = options.scale ?? 1;
  const background = options.background ?? (format === 'mp4' ? 'white' : undefined);
  const fps = 1000 / frameDurationMs;
  const dir = mkdtempSync(join(tmpdir(), 'bpmn-to-image-'));

  try {
    rasterizeFramesToDir(frames, scale, background, dir, options.onProgress);
    const outPath = join(dir, `out.${format}`);

    const args = [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      join(dir, 'frame_%05d.png'),
      ...formatArgs(format),
      outPath,
    ];

    const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString('utf-8').slice(-4000) ?? '';
      throw new Error(`[bpmn-to-image] ffmpeg exited with code ${result.status}: ${stderr}`);
    }

    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Encode frames as an animated GIF via ffmpeg's two-pass palette filter (better quality than `framesToGif`). */
export function framesToGifWithFfmpeg(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions = {}
): Buffer {
  return runFfmpeg(frames, frameDurationMs, options, 'gif');
}

/** Encode frames as an animated PNG (APNG) via ffmpeg — 24-bit color + real alpha, not possible with GIF. */
export function framesToApng(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions = {}
): Buffer {
  return runFfmpeg(frames, frameDurationMs, options, 'apng');
}

/** Encode frames as an MP4 (H.264) video via ffmpeg — much smaller than GIF/APNG, at the cost of universal auto-play support. */
export function framesToMp4(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions = {}
): Buffer {
  return runFfmpeg(frames, frameDurationMs, options, 'mp4');
}

/** Encode frames as an animated WebP via ffmpeg — smaller than GIF at comparable quality. */
export function framesToWebp(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions = {}
): Buffer {
  return runFfmpeg(frames, frameDurationMs, options, 'webp');
}
