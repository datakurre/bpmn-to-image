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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: PKG_VERSION } = require('../package.json') as { version: string };

interface CliOptions {
  input: string;
  output: string;
  format?: 'svg' | 'png';
  scale: number;
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
  -f, --format <svg|png>  Output format. Inferred from the output file
                           extension when omitted; defaults to "svg" when
                           writing to stdout.
  -s, --scale <number>    PNG pixel density multiplier. Default: 2.
  -h, --help               Show this help message and exit.
      --version             Print the version and exit.

Examples:
  bpmn-to-image diagram.bpmn diagram.svg
  bpmn-to-image diagram.bpmn diagram.png
  cat diagram.bpmn | bpmn-to-image --format png > diagram.png
`);
}

function formatFromPath(filePath: string): 'svg' | 'png' | undefined {
  if (filePath.endsWith('.png')) return 'png';
  if (filePath.endsWith('.svg')) return 'svg';
  return undefined;
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  let format: 'svg' | 'png' | undefined;
  let scale = 2;

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
        if (value !== 'svg' && value !== 'png') {
          throw new Error(
            `Invalid --format value: ${value ?? '(missing)'}. Expected "svg" or "png".`
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
      default:
        positional.push(arg);
    }
  }

  const input = positional[0] && positional[0] !== '-' ? positional[0] : '-';
  const output = positional[1] && positional[1] !== '-' ? positional[1] : '-';

  if (!format) {
    format = (output !== '-' ? formatFromPath(output) : undefined) ?? 'svg';
  }

  return { input, output, format, scale };
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

  const rendered =
    options.format === 'png'
      ? await renderToPng(xml, { scale: options.scale })
      : Buffer.from(await renderToSvg(xml), 'utf-8');

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
