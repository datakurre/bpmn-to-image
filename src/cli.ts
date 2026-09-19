#!/usr/bin/env node
/**
 * bpmn-to-image CLI.
 *
 * Renders a BPMN 2.0 XML file to SVG or PNG headlessly.
 *
 * Usage:
 *   bpmn-to-image [options] [input] [output]
 */

import * as fs from 'node:fs';
import { createTerminalProgressReporter } from './progress-bar';
import { renderToPng, renderToSvg } from './render';
import { svgToPng } from './svg-to-png';
import {
  exportScenarioTemplate,
  renderScenarioFrames,
  renderScenarioToApng,
  renderScenarioToGif,
  renderScenarioToMp4,
  renderScenarioToWebp,
  type GifEncoder,
} from './token-simulation';
import { renderInteractiveAssetsHtml, renderInteractiveHtml } from './interactive';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: PKG_VERSION } = require('../package.json') as { version: string };

type AnimatedFormat = 'gif' | 'apng' | 'mp4' | 'webp';
type Format = 'svg' | 'png' | 'html' | AnimatedFormat;

const ANIMATED_FORMATS: readonly AnimatedFormat[] = ['gif', 'apng', 'mp4', 'webp'];

function isAnimatedFormat(format: Format): format is AnimatedFormat {
  return (ANIMATED_FORMATS as readonly Format[]).includes(format);
}

interface CliOptions {
  input: string;
  output: string;
  format?: Format;
  scale: number;
  background?: string;
  scenario?: string;
  exportScenario: boolean;
  fps?: number;
  maxDurationMs?: number;
  smooth: boolean;
  encoder?: GifEncoder;
  frames?: string;
  id?: string;
  noAssets: boolean;
  printViewerAssets: boolean;
  width?: string;
  height?: string;
  align?: 'left' | 'center' | 'right';
}

function printUsage(): void {
  console.error(`bpmn-to-image v${PKG_VERSION}

Render BPMN 2.0 XML to SVG or PNG, headlessly.

Usage:
  bpmn-to-image [options] [input] [output]

Arguments:
  input                  Path to a .bpmn/.xml file. Omit or pass "-" to read
                          from stdin.
  output                 Path to write the rendered image to. Omit or pass
                          "-" to write to stdout.

Options:
  -f, --format <svg|png|html|gif|apng|mp4|webp>
                           Output format. Inferred from the output file
                           extension when omitted; defaults to "svg" when
                           writing to stdout. "apng"/"mp4"/"webp" require
                           ffmpeg. "html" renders a self-contained,
                           interactive simulator embed (see below) instead
                           of a headless render.
  -s, --scale <number>    Pixel density multiplier (PNG or an animated
                           format). Default: 2.
  -b, --background <color>
                           Background color (CSS color string, e.g. "white",
                           "#FFFFFF"). Default: transparent for SVG/PNG/GIF/
                           APNG/WebP, and "white" for MP4 (which does not
                           support transparency).
      --scenario <file>   Steer the animation with this TOML scenario file
                           (see --export-scenario). Omit to render the
                           diagram's own default scenario instead (one
                           token per start event, first outgoing flow at
                           every gateway).
      --fps <number>      Animation frame rate, overriding both --smooth
                           and the scenario's own "fps" (default: 12).
                            Higher = smoother motion at proportionally more
                            render cost.
      --max-duration <ms>  Maximum simulated duration in milliseconds before
                           stopping (default: 30000).
      --frames <dir>      Export every token-simulation frame to this directory.
                          Use --format svg (default) or --format png.
      --smooth            Render at a smoother preset frame rate (30fps)
                           instead of the fast default — for the final
                           render once you're happy with a scenario, after
                           iterating on it at the cheaper default.
      --encoder <auto|gifenc|ffmpeg>
                           GIF-only encoder choice. "auto" (default) prefers
                           ffmpeg (better palette quality, smaller files)
                           when it's on PATH — provisioned by this repo's
                           Nix flake — falling back to the bundled pure-JS
                           gifenc otherwise. apng/mp4/webp always need ffmpeg.
      --export-scenario   Write a scenario TOML scaffold for the input
                           diagram (covering its tokens/gateways/events)
                           instead of rendering an image.
      --id <string>        DOM id for the --format html container element.
                           Default: a short hash of the diagram XML, so
                           repeated builds of the same diagram produce
                           identical output.
      --width <css-length>  With --format html, container width (e.g.
                           "600px", "80%"). Default: "100%".
      --height <css-length>
                           With --format html, container height (e.g.
                           "60%"). Default: none — a 400px min-height
                           floor instead, growing to fill a flex/grid box
                           on the host page. An explicit height opts out
                           of that growth, like on a plain <img>/<video>.
      --align <left|center|right>
                           With --format html, horizontal alignment when
                           the container doesn't fill the full width
                           available to it (e.g. an explicit --width).
      --no-assets          With --format html, omit the shared <style> +
                           <script> bundle (bpmn-js + token-simulation CSS
                           and JS) and emit only the small per-diagram
                           container + init call. Use this for every
                           diagram after the first one on a page that
                           already loaded the assets via
                           --print-viewer-assets or a prior --format html
                           output.
      --print-viewer-assets
                           Write just the shared <style> + <script> bundle
                           that --format html embeds, and exit — no input
                           is read. Emit this once per page, then use
                           --format html --no-assets for every diagram.
  -h, --help               Show this help message and exit.
      --version             Print the version and exit.

Examples:
  bpmn-to-image diagram.bpmn diagram.svg
  bpmn-to-image diagram.bpmn diagram.png
  bpmn-to-image --background white diagram.bpmn diagram.png
  cat diagram.bpmn | bpmn-to-image --format png > diagram.png
  bpmn-to-image diagram.bpmn diagram.gif                      # default scenario
  bpmn-to-image --export-scenario diagram.bpmn diagram.toml
  bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.gif
  bpmn-to-image --scenario diagram.toml --fps 24 diagram.bpmn diagram.gif
  bpmn-to-image --scenario diagram.toml --max-duration 60000 diagram.bpmn diagram.gif
  bpmn-to-image --scenario diagram.toml --smooth diagram.bpmn diagram-final.gif
  bpmn-to-image --scenario diagram.toml --frames frames diagram.bpmn
  bpmn-to-image --scenario diagram.toml --frames frames --format png diagram.bpmn
  bpmn-to-image diagram.bpmn diagram.apng
  bpmn-to-image diagram.bpmn diagram.mp4
  bpmn-to-image diagram.bpmn diagram.webp
  bpmn-to-image --format html diagram.bpmn diagram.html
  bpmn-to-image --format html --no-assets diagram.bpmn diagram.html
  bpmn-to-image --print-viewer-assets assets.html
`);
}

function formatFromPath(filePath: string): Format | undefined {
  if (filePath.endsWith('.png')) return 'png';
  if (filePath.endsWith('.svg')) return 'svg';
  if (filePath.endsWith('.html')) return 'html';
  if (filePath.endsWith('.apng')) return 'apng';
  if (filePath.endsWith('.gif')) return 'gif';
  if (filePath.endsWith('.mp4')) return 'mp4';
  if (filePath.endsWith('.webp')) return 'webp';
  return undefined;
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  let format: Format | undefined;
  let scale = 2;
  let background: string | undefined;
  let scenario: string | undefined;
  let exportScenario = false;
  let fps: number | undefined;
  let maxDurationMs: number | undefined;
  let smooth = false;
  let encoder: GifEncoder | undefined;
  let frames: string | undefined;
  let id: string | undefined;
  let noAssets = false;
  let printViewerAssets = false;
  let width: string | undefined;
  let height: string | undefined;
  let align: 'left' | 'center' | 'right' | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        return null;
      case '--version':
        console.log(PKG_VERSION);
        return null;
      case '-f':
      case '--format': {
        const value = argv[++i];
        const valid: Format[] = ['svg', 'png', 'html', 'gif', 'apng', 'mp4', 'webp'];
        if (!valid.includes(value as Format)) {
          throw new Error(
            `Invalid --format value: ${value ?? '(missing)'}. Expected one of: ${valid.join(', ')}.`
          );
        }
        format = value as Format;
        break;
      }
      case '-s':
      case '--scale': {
        const value = Number(argv[++i]);
        if (!isFinite(value) || value <= 0) {
          throw new Error(`Invalid --scale value: ${argv[i]}. Expected a positive number.`);
        }
        scale = value;
        break;
      }
      case '-b':
      case '--background':
        background = argv[++i];
        break;
      case '--scenario':
        scenario = argv[++i];
        break;
      case '--frames':
      case '--export-frames':
        frames = argv[++i];
        if (!frames || frames.startsWith('-')) {
          throw new Error(
            `Invalid --frames value: ${frames ?? '(missing)'}. Expected a directory.`
          );
        }
        break;
      case '--fps': {
        const value = Number(argv[++i]);
        if (!isFinite(value) || value <= 0) {
          throw new Error(`Invalid --fps value: ${argv[i]}. Expected a positive number.`);
        }
        fps = value;
        break;
      }
      case '--max-duration': {
        const value = Number(argv[++i]);
        if (!isFinite(value) || value < 0) {
          throw new Error(
            `Invalid --max-duration value: ${argv[i]}. Expected a non-negative number of milliseconds.`
          );
        }
        maxDurationMs = value;
        break;
      }
      case '--export-scenario':
        exportScenario = true;
        break;
      case '--smooth':
        smooth = true;
        break;
      case '--encoder': {
        const value = argv[++i];
        if (value !== 'auto' && value !== 'gifenc' && value !== 'ffmpeg') {
          throw new Error(
            `Invalid --encoder value: ${value ?? '(missing)'}. Expected "auto", "gifenc", or "ffmpeg".`
          );
        }
        encoder = value;
        break;
      }
      case '--id':
        id = argv[++i];
        break;
      case '--width':
        width = argv[++i];
        break;
      case '--height':
        height = argv[++i];
        break;
      case '--align': {
        const value = argv[++i];
        if (value !== 'left' && value !== 'center' && value !== 'right') {
          throw new Error(
            `Invalid --align value: ${value ?? '(missing)'}. Expected "left", "center", or "right".`
          );
        }
        align = value;
        break;
      }
      case '--no-assets':
        noAssets = true;
        break;
      case '--print-viewer-assets':
        printViewerAssets = true;
        break;
      default:
        positional.push(arg);
    }
  }

  if (printViewerAssets) {
    return {
      input: '-',
      output: positional[0] && positional[0] !== '-' ? positional[0] : '-',
      format: 'html',
      scale,
      background,
      scenario,
      exportScenario,
      fps,
      maxDurationMs,
      smooth,
      encoder,
      frames,
      id,
      noAssets,
      printViewerAssets,
    };
  }

  const input = positional[0] && positional[0] !== '-' ? positional[0] : '-';
  const output = positional[1] && positional[1] !== '-' ? positional[1] : '-';

  if (!format) {
    format =
      (output !== '-' ? formatFromPath(output) : undefined) ??
      (frames ? 'svg' : scenario ? 'gif' : 'svg');
  }

  if (frames && isAnimatedFormat(format)) {
    throw new Error('--frames only supports --format svg or --format png.');
  }

  return {
    input,
    output,
    format,
    scale,
    background,
    scenario,
    exportScenario,
    fps,
    maxDurationMs,
    smooth,
    encoder,
    frames,
    id,
    noAssets,
    printViewerAssets,
    width,
    height,
    align,
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\n`);
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (!options) return;

  if (options.printViewerAssets) {
    const html = renderInteractiveAssetsHtml();
    if (options.output === '-') {
      process.stdout.write(html);
    } else {
      fs.writeFileSync(options.output, html);
    }
    return;
  }

  const xml = options.input === '-' ? await readStdin() : fs.readFileSync(options.input, 'utf-8');

  if (options.format === 'html') {
    const html = renderInteractiveHtml(xml, {
      id: options.id,
      background: options.background,
      width: options.width,
      height: options.height,
      align: options.align,
      includeAssets: !options.noAssets,
    });
    if (options.output === '-') {
      process.stdout.write(html);
    } else {
      fs.writeFileSync(options.output, html);
    }
    return;
  }

  if (options.exportScenario) {
    const template = await exportScenarioTemplate(xml);
    if (options.output === '-') {
      process.stdout.write(template);
    } else {
      fs.writeFileSync(options.output, template);
    }
    return;
  }

  if (options.frames) {
    const scenarioToml = options.scenario ? fs.readFileSync(options.scenario, 'utf-8') : undefined;
    const progress = createTerminalProgressReporter();
    const result = await renderScenarioFrames(xml, scenarioToml, {
      fps: options.fps,
      maxDurationMs: options.maxDurationMs,
      smooth: options.smooth,
      background: options.background,
      onProgress: progress,
    });
    fs.mkdirSync(options.frames, { recursive: true });
    const width = Math.max(4, String(Math.max(0, result.frames.length - 1)).length);

    for (let i = 0; i < result.frames.length; i++) {
      const extension = options.format === 'png' ? 'png' : 'svg';
      const fileName = `frame-${String(i).padStart(width, '0')}.${extension}`;
      const data =
        options.format === 'png'
          ? svgToPng(result.frames[i].svg, {
              scale: options.scale,
              background: options.background,
            })
          : Buffer.from(result.frames[i].svg, 'utf-8');
      fs.writeFileSync(`${options.frames}/${fileName}`, data);
      progress({ phase: 'rasterize', current: i + 1, total: result.frames.length });
    }
    return;
  }

  let rendered: Buffer;
  if (options.format && isAnimatedFormat(options.format)) {
    // scenarioToml left undefined renders the diagram's own default
    // scenario (see exportScenarioTemplate) — no --scenario file required.
    const scenarioToml = options.scenario ? fs.readFileSync(options.scenario, 'utf-8') : undefined;
    const onProgress = createTerminalProgressReporter();
    const animOptions = {
      scale: options.scale,
      background: options.background,
      fps: options.fps,
      maxDurationMs: options.maxDurationMs,
      smooth: options.smooth,
      onProgress,
    };

    switch (options.format) {
      case 'apng':
        rendered = await renderScenarioToApng(xml, scenarioToml, animOptions);
        break;
      case 'mp4':
        rendered = await renderScenarioToMp4(xml, scenarioToml, animOptions);
        break;
      case 'webp':
        rendered = await renderScenarioToWebp(xml, scenarioToml, animOptions);
        break;
      default:
        rendered = await renderScenarioToGif(xml, scenarioToml, {
          ...animOptions,
          encoder: options.encoder,
        });
    }
  } else if (options.format === 'png') {
    rendered = await renderToPng(xml, { scale: options.scale, background: options.background });
  } else {
    rendered = Buffer.from(await renderToSvg(xml, { background: options.background }), 'utf-8');
  }

  if (options.output === '-') {
    process.stdout.write(rendered);
  } else {
    fs.writeFileSync(options.output, rendered);
  }
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
});
