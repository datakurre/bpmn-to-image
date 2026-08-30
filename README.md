# bpmn-to-image

Render [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/) XML to SVG or PNG headlessly — no browser, no Canvas / node-gyp build chain. Uses [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) inside a [jsdom](https://github.com/jsdom/jsdom) environment (patched with the SVG/Canvas polyfills bpmn-js needs at runtime) and rasterizes with [@resvg/resvg-js](https://github.com/thx/resvg-js).

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
- `-f, --format <svg|png|gif>` — output format. Inferred from the output file extension when omitted; defaults to `svg` for stdout.
- `-s, --scale <number>` — pixel density multiplier (PNG/GIF). Default: `2`.
- `--scenario <file>` — render an animated token-simulation GIF, driven by this TOML scenario file (see [Animated executions](#animated-executions)).
- `--fps <number>` — animation frame rate, overriding the scenario's own `fps` (default: `12`). Higher values trade smoother token motion for proportionally more frames to render.
- `--export-scenario` — write a scenario TOML scaffold for the input diagram instead of rendering an image.

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

## Animated executions

`bpmn-to-image` can also render an animated GIF of a diagram "running", by driving [bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation) headlessly instead of just exporting a static frame. By itself, token simulation only knows how to auto-advance through tasks — a gateway with more than one outgoing flow, or a catch/boundary event, needs an explicit decision (a mouse click, in the interactive tool). A **scenario** is the headless equivalent of that click stream: a small TOML file listing which flow each gateway takes and when each event fires.

Generate a scenario scaffold for a diagram — it walks the diagram and lists every gateway and start/intermediate-catch/boundary event it finds, so you edit real element ids rather than starting from a blank file:

```bash
bpmn-to-image --export-scenario diagram.bpmn diagram.toml
```

```toml
fps = 12

[[trigger]]
element = "StartEvent_1" # Request received
at_ms = 0

[[trigger]]
element = "Gateway_1" # Approved?
at_ms = 500
take = "Flow_approve"  # options: Flow_approve, Flow_reject
```

Then render the animation:

```bash
bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.gif
```

Or from the library:

```ts
import { exportScenarioTemplate, renderScenarioToGif } from 'bpmn-to-image';

const scenarioToml = await exportScenarioTemplate(xml); // or hand-written
const gif = await renderScenarioToGif(xml, scenarioToml);
```

A `[[trigger]]` either fires an event (`element` = a start/intermediate-catch/boundary event id, fired as soon as `at_ms` has elapsed and the diagram is actually waiting on it) or steers a gateway (`element` = the gateway id, `take` = the outgoing sequence flow id — or an array of ids, for an inclusive gateway fork). Gateways with no matching trigger default to their first outgoing flow, same as the interactive tool. `renderScenarioFrames` (SVG frames + timing, no GIF encoding) and `framesToGif` are also exported individually for custom pipelines.

Token motion is real interpolated animation (not a jump per gateway/event), sampled at a fixed frame rate — the scenario's `fps` field, or the `fps` option/`--fps` flag, which overrides it. Raising it renders more, smoother frames at proportionally higher cost; the default (`12`) is a reasonable balance for GIF output.

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

`flake.nix` packages the project with `buildNpmPackage` (the derivation lives in `nix/package.nix`, pinned via `npmDepsHash`). After changing `package-lock.json`, run `nix build` once — it fails with a hash mismatch that prints the correct value to paste back into `nix/package.nix`.

The flake also exposes `overlays.default`, adding `bpmn-to-image` to `pkgs` for consumption from another flake:

```nix
{
  inputs.bpmn-to-image.url = "github:datakurre/bpmn-to-image";

  outputs = { self, nixpkgs, bpmn-to-image }:
    let
      pkgs = import nixpkgs {
        system = "x86_64-linux";
        overlays = [ bpmn-to-image.overlays.default ];
      };
    in
    {
      # pkgs.bpmn-to-image is now available
    };
}
```

## License

MIT — see [LICENSE](./LICENSE). Bundled fonts under `fonts/` are Liberation Sans, licensed separately (see [fonts/LICENSE](./fonts/LICENSE)).
