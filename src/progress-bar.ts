/**
 * Minimal terminal progress bar for the CLI's GIF/APNG rendering (which,
 * unlike static SVG/PNG output, can take a few seconds for larger diagrams
 * or longer scenarios). Writes to stderr only, and only when it's a TTY, so
 * piped/non-interactive output (CI logs, `> file.gif`) never gets `\r`
 * control sequences mixed in with real output.
 */

import type { RenderProgress } from './token-simulation';

const BAR_WIDTH = 24;
const PHASE_LABELS: Record<RenderProgress['phase'], string> = {
  simulate: 'Simulating',
  rasterize: 'Rasterizing',
};

/** Create a progress callback that renders a live bar to stderr for each `RenderProgress` tick. */
export function createTerminalProgressReporter(): (progress: RenderProgress) => void {
  const isTty = process.stderr.isTTY === true;

  return (progress: RenderProgress) => {
    if (!isTty) return;

    const ratio = progress.total > 0 ? progress.current / progress.total : 1;
    const filled = Math.min(BAR_WIDTH, Math.round(BAR_WIDTH * ratio));
    const bar = '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled);
    const label = PHASE_LABELS[progress.phase].padEnd(11);

    process.stderr.write(`\r${label} [${bar}] ${progress.current}/${progress.total}`);
    if (progress.current >= progress.total) process.stderr.write('\n');
  };
}
