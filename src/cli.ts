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
import { renderToPng, renderToSvg } from './render';
import {
  exportScenarioTemplate,
  renderScenarioToApng,
  renderScenarioToGif,
  type GifEncoder,
} from './token-simulation';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: PKG_VERSION } = require('../package.json') as { version: string };

interface CliOptions {
  input: string;
  output: string;
  format?: 'svg' | 'png' | 'gif' | 'apng';
  scale: number;
  scenario?: string;
  exportScenario: boolean;
  fps?: number;
  encoder?: GifEncoder;
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
  -f, --format <svg|png|gif|apng>  Output format. Inferred from the output
                           file extension when omitted; defaults to "svg"
                           when writing to stdout. "apng" requires ffmpeg.
  -s, --scale <number>    Pixel density multiplier (PNG/GIF/APNG). Default: 2.
      --scenario <file>   Render an animated token-simulation GIF/APNG,
                           driven by this TOML scenario file (see
                           --export-scenario).
      --fps <number>      Animation frame rate, overriding the scenario's
                           own "fps" (default: 12). Higher = smoother motion
                           at proportionally more render cost.
      --encoder <auto|gifenc|ffmpeg>
                           GIF encoder. "auto" (default) prefers ffmpeg
                           (better palette quality) when it's on PATH —
                           provisioned by this repo's Nix flake — falling
                           back to the bundled pure-JS gifenc otherwise.
      --export-scenario   Write a scenario TOML scaffold for the input
                           diagram (covering its tokens/gateways/events)
                           instead of rendering an image.
  -h, --help               Show this help message and exit.
      --version             Print the version and exit.

Examples:
  bpmn-to-image diagram.bpmn diagram.svg
  bpmn-to-image diagram.bpmn diagram.png
  cat diagram.bpmn | bpmn-to-image --format png > diagram.png
  bpmn-to-image --export-scenario diagram.bpmn diagram.toml
  bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.gif
  bpmn-to-image --scenario diagram.toml --fps 24 diagram.bpmn diagram.gif
  bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.apng
`);
}

function formatFromPath(filePath: string): 'svg' | 'png' | 'gif' | 'apng' | undefined {
  if (filePath.endsWith('.png')) return 'png';
  if (filePath.endsWith('.svg')) return 'svg';
  if (filePath.endsWith('.apng')) return 'apng';
  if (filePath.endsWith('.gif')) return 'gif';
  return undefined;
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  let format: 'svg' | 'png' | 'gif' | 'apng' | undefined;
  let scale = 2;
  let scenario: string | undefined;
  let exportScenario = false;
  let fps: number | undefined;
  let encoder: GifEncoder | undefined;

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
        if (value !== 'svg' && value !== 'png' && value !== 'gif' && value !== 'apng') {
          throw new Error(
            `Invalid --format value: ${value ?? '(missing)'}. Expected "svg", "png", "gif", or "apng".`
          );
        }
        format = value;
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
      case '--scenario':
        scenario = argv[++i];
        break;
      case '--fps': {
        const value = Number(argv[++i]);
        if (!isFinite(value) || value <= 0) {
          throw new Error(`Invalid --fps value: ${argv[i]}. Expected a positive number.`);
        }
        fps = value;
        break;
      }
      case '--export-scenario':
        exportScenario = true;
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
      default:
        positional.push(arg);
    }
  }

  const input = positional[0] && positional[0] !== '-' ? positional[0] : '-';
  const output = positional[1] && positional[1] !== '-' ? positional[1] : '-';

  if (!format) {
    format = (output !== '-' ? formatFromPath(output) : undefined) ?? (scenario ? 'gif' : 'svg');
  }

  return { input, output, format, scale, scenario, exportScenario, fps, encoder };
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

  const xml = options.input === '-' ? await readStdin() : fs.readFileSync(options.input, 'utf-8');

  if (options.exportScenario) {
    const template = await exportScenarioTemplate(xml);
    if (options.output === '-') {
      process.stdout.write(template);
    } else {
      fs.writeFileSync(options.output, template);
    }
    return;
  }

  let rendered: Buffer;
  if (options.scenario) {
    const scenarioToml = fs.readFileSync(options.scenario, 'utf-8');
    if (options.format === 'apng') {
      rendered = await renderScenarioToApng(xml, scenarioToml, {
        scale: options.scale,
        fps: options.fps,
      });
    } else {
      rendered = await renderScenarioToGif(xml, scenarioToml, {
        scale: options.scale,
        fps: options.fps,
        encoder: options.encoder,
      });
    }
  } else if (options.format === 'png') {
    rendered = await renderToPng(xml, { scale: options.scale });
  } else if (options.format === 'gif' || options.format === 'apng') {
    throw new Error(`--format ${options.format} requires --scenario <file>`);
  } else {
    rendered = Buffer.from(await renderToSvg(xml), 'utf-8');
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
