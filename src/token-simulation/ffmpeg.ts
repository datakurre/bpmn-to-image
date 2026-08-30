/**
 * Optional ffmpeg-based encoder for animation frames — better GIF quality
 * (two-pass palette generation) than the pure-JS `gifenc` fallback, and
 * APNG output, which `gifenc` can't produce at all (GIF-only encoder).
 *
 * ffmpeg is not an npm dependency — this package still installs and works
 * with plain `npm install` alone. It's an *optional* enhancement, detected
 * at runtime via `isFfmpegAvailable()`, that only shows up when ffmpeg is
 * actually on `PATH` — which the Nix flake in this repo provisions (the
 * devShell, and the packaged CLI via a wrapped PATH) but a plain `npm
 * install` does not. See `gif.ts` for the always-available fallback.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rasterizeSvg } from '../svg-to-png';
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
}

function rasterizeFramesToDir(frames: AnimationFrame[], scale: number, dir: string): void {
  for (const [i, frame] of frames.entries()) {
    const png = rasterizeSvg(frame.svg, scale).asPng();
    writeFileSync(join(dir, `frame_${String(i).padStart(5, '0')}.png`), png);
  }
}

function runFfmpeg(
  frames: AnimationFrame[],
  frameDurationMs: number,
  options: FfmpegEncodeOptions,
  format: 'gif' | 'apng'
): Buffer {
  if (frames.length === 0) {
    throw new Error(`[bpmn-to-image] cannot encode a ${format.toUpperCase()} from zero frames`);
  }
  if (!isFfmpegAvailable()) {
    throw new Error(
      '[bpmn-to-image] ffmpeg not found on PATH — install it, or use the Nix devShell/package ' +
        '(flake.nix provisions it), or render a GIF via framesToGif() instead.'
    );
  }

  const scale = options.scale ?? 1;
  const fps = 1000 / frameDurationMs;
  const dir = mkdtempSync(join(tmpdir(), 'bpmn-to-image-'));

  try {
    rasterizeFramesToDir(frames, scale, dir);
    const outPath = join(dir, `out.${format}`);

    const args = ['-y', '-framerate', String(fps), '-i', join(dir, 'frame_%05d.png')];
    if (format === 'gif') {
      args.push('-lavfi', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0');
    } else {
      args.push('-plays', '0');
    }
    args.push(outPath);

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
