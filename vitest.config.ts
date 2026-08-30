import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    // bpmn-js is heavy; run sequentially to avoid OOM in CI
    sequence: { concurrent: false },
  },
});
