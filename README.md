# bpmn-to-image

Render [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/) XML to SVG or PNG headlessly — no browser, no Canvas / node-gyp build chain. Uses [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) inside a [jsdom](https://github.com/jsdom/jsdom) environment (patched with the SVG/Canvas polyfills bpmn-js needs at runtime) and rasterizes with [@resvg/resvg-js](https://github.com/thx/resvg-js).

Vendored and updated from the headless-rendering pipeline of [bpmn-js-mcp](https://github.com/datakurre/bpmn-js-mcp), stripped down to just BPMN → image conversion.

## Install

```bash
npm install bpmn-to-image
```

Or run it standalone with [Nix](https://nixos.org/):

```bash
nix run github:datakurre/bpmn-to-image -- diagram.bpmn diagram.png
```

## CLI

```
bpmn-to-image [options] [input] [output]
```

- `input` — path to a `.bpmn`/`.xml` file. Omit or pass `-` to read from stdin.
- `output` — path to write the rendered image to. Omit or pass `-` to write to stdout.
- `-f, --format <svg|png>` — output format. Inferred from the output file extension when omitted; defaults to `svg` for stdout.
- `-s, --scale <number>` — PNG pixel density multiplier. Default: `2`.

```bash
bpmn-to-image diagram.bpmn diagram.svg
bpmn-to-image diagram.bpmn diagram.png
cat diagram.bpmn | bpmn-to-image --format png > diagram.png
```

## Library

```ts
import { renderToSvg, renderToPng } from 'bpmn-to-image';
import { readFileSync } from 'node:fs';

const xml = readFileSync('diagram.bpmn', 'utf-8');

const svg = await renderToSvg(xml);
const png = await renderToPng(xml, { scale: 2 });
```

Both functions accept an optional `moddleExtensions` map (merged with the built-in [Camunda 7 / Operaton](https://docs.camunda.org/manual/7.24/) moddle extension) for diagrams that use other BPMN extension namespaces.

## Fonts

`@resvg/resvg-js` has no access to browser fonts, so PNG rendering needs real font files to rasterize text labels:

- On Linux/macOS/Windows, system font directories are scanned automatically.
- Nix builds/shells that set `FONTCONFIG_PATH` are also honored.
- As a guaranteed fallback (minimal containers, CI runners, AWS Lambda), this package bundles [Liberation Sans](https://github.com/liberationfonts/liberation-fonts) (metrically equivalent to Arial) under `fonts/`.

If genuinely no font files can be found anywhere, `svgToPngWithFallback` (exported for advanced use) returns the SVG instead of a blank-labeled PNG.

## Development

```bash
npm install
npm run build       # esbuild bundle + type declarations -> dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm test             # vitest
```

### Nix

```bash
nix develop           # devShell with Node.js + fonts
nix build              # build the package (./result/bin/bpmn-to-image)
nix run . -- --help    # run directly
```

`flake.nix` packages the project with `buildNpmPackage`, pinned via `npmDepsHash` in `flake.nix`. After changing `package-lock.json`, run `nix build` once — it fails with a hash mismatch that prints the correct value to paste back into `flake.nix`.

## License

MIT — see [LICENSE](./LICENSE). Bundled fonts under `fonts/` are Liberation Sans, licensed separately (see [fonts/LICENSE](./fonts/LICENSE)).
