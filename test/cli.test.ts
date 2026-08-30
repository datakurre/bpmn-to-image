import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

const cliPath = join(__dirname, '../dist/cli.js');
const fixturePath = join(__dirname, 'fixtures/sample.bpmn');

let workDir: string;

beforeAll(() => {
  if (!existsSync(cliPath)) {
    throw new Error(`${cliPath} not found — run "npm run build" before the test suite.`);
  }
});

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe('bpmn-to-image CLI', () => {
  test('renders a .bpmn file to an .svg file', () => {
    workDir = mkdtempSync(join(tmpdir(), 'bpmn-to-image-'));
    const outPath = join(workDir, 'out.svg');
    execFileSync('node', [cliPath, fixturePath, outPath]);
    const svg = readFileSync(outPath, 'utf-8');
    expect(svg).toContain('<svg');
  });

  test('renders a .bpmn file to a .png file', () => {
    workDir = mkdtempSync(join(tmpdir(), 'bpmn-to-image-'));
    const outPath = join(workDir, 'out.png');
    execFileSync('node', [cliPath, fixturePath, outPath]);
    const png = readFileSync(outPath);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test('reads from stdin and writes to stdout when paths are omitted', () => {
    const xml = readFileSync(fixturePath, 'utf-8');
    const output = execFileSync('node', [cliPath], { input: xml });
    expect(output.toString('utf-8')).toContain('<svg');
  });

  test('--format overrides output-extension inference', () => {
    workDir = mkdtempSync(join(tmpdir(), 'bpmn-to-image-'));
    const xml = readFileSync(fixturePath, 'utf-8');
    const output = execFileSync('node', [cliPath, '--format', 'png'], { input: xml });
    expect(output.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });
});
