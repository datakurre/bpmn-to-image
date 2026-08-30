import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTerminalProgressReporter } from '../src/progress-bar';

let originalIsTTY: boolean | undefined;

beforeEach(() => {
  originalIsTTY = process.stderr.isTTY;
});

afterEach(() => {
  Object.defineProperty(process.stderr, 'isTTY', { value: originalIsTTY, configurable: true });
  vi.restoreAllMocks();
});

describe('createTerminalProgressReporter', () => {
  test('writes a carriage-return-prefixed bar to stderr when stderr is a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const report = createTerminalProgressReporter();
    report({ phase: 'simulate', current: 1, total: 4 });
    report({ phase: 'simulate', current: 4, total: 4 });

    expect(write).toHaveBeenCalledTimes(3); // 2 bar updates + 1 trailing newline on completion
    expect(write.mock.calls[0][0]).toMatch(/^\rSimulating .*1\/4/);
    expect(write.mock.calls[1][0]).toMatch(/^\rSimulating .*4\/4/);
    expect(write.mock.calls[2][0]).toBe('\n');
  });

  test('does nothing when stderr is not a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    createTerminalProgressReporter()({ phase: 'rasterize', current: 1, total: 1 });

    expect(write).not.toHaveBeenCalled();
  });
});
