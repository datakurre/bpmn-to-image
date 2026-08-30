import { build, context } from 'esbuild';

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outdir: 'dist',
  entryNames: '[name]',
  external: ['jsdom', 'bpmn-js', 'camunda-bpmn-moddle', '@resvg/resvg-js'],
};

const isWatch = process.argv.includes('--watch');

if (isWatch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(config);
}
