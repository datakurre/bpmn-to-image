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
- `-f, --format <svg|png|gif|apng>` — output format. Inferred from the output file extension when omitted; defaults to `svg` for stdout. `apng` requires ffmpeg.
- `-s, --scale <number>` — pixel density multiplier (PNG/GIF/APNG). Default: `2`.
- `--scenario <file>` — render an animated token-simulation GIF/APNG, driven by this TOML scenario file (see [Animated executions](#animated-executions)).
- `--fps <number>` — animation frame rate, overriding the scenario's own `fps` (default: `12`). Higher values trade smoother token motion for proportionally more frames to render.
- `--encoder <auto|gifenc|ffmpeg>` — GIF encoder. `auto` (default) prefers ffmpeg (better palette quality) when it's on `PATH`, falling back to the bundled pure-JS `gifenc` otherwise.
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

`bpmn-to-image` can also render an animation of a diagram "running", by driving [bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation) headlessly instead of just exporting a static frame. By itself, token simulation only knows how to auto-advance through tasks — a gateway with more than one outgoing flow, or a catch/boundary event, needs an explicit decision (a mouse click, in the interactive tool). A **scenario** is the headless equivalent of that click stream, expressed as a small TOML file.

A scenario is a set of **named tokens**, each an independent timeline through the diagram: the first `[[token.step]]` spawns it from a start event, and later steps steer a gateway it reaches (`take`) or fire a catch/boundary event it's waiting on (`at_ms`, ms from simulation start) — _as that specific token_ encounters them. That's what makes concurrent tokens genuinely independent: two tokens can take opposite branches at the very same gateway, because the engine tracks which running scope belongs to which named token rather than just setting one global "current flow" for the whole diagram. Repeating the same element id within one token's steps controls a loop's 1st, 2nd, 3rd, ... visit to it.

Generate a scenario scaffold for a diagram — it walks the diagram's actual control flow (one token per start event, following the default/first-outgoing path, matching what the interactive tool does with no clicks at all) so you start from real element ids and a runnable default, not a blank file:

```bash
bpmn-to-image --export-scenario diagram.bpmn diagram.toml
```

```toml
fps = 12

[[token]]
name = "request-received-1"

  [[token.step]]
  element = "StartEvent_1" # Request received
  at_ms = 0

  [[token.step]]
  element = "Gateway_1" # Approved?
  take = "Flow_approve"  # options: Flow_approve, Flow_reject
```

Add a second `[[token]]` block (with its own `[[token.step]]` entries) for a concurrent token — e.g. staggering `at_ms` and steering it down `Flow_reject` instead, to render both outcomes racing through the same diagram at once.

Then render the animation:

```bash
bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.gif
bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.apng   # requires ffmpeg
```

Or from the library:

```ts
import { exportScenarioTemplate, renderScenarioToGif } from 'bpmn-to-image';

const scenarioToml = await exportScenarioTemplate(xml); // or hand-written
const gif = await renderScenarioToGif(xml, scenarioToml);
```

`renderScenarioFrames` (SVG frames + timing, no encoding) is also exported for custom pipelines.

Token motion is real interpolated animation (not a jump per gateway/event), sampled at a fixed frame rate — the scenario's `fps` field, or the `fps` option/`--fps` flag, which overrides it. Raising it renders more, smoother frames at proportionally higher cost; the default (`12`) is a reasonable balance for GIF output.

### GIF quality and APNG output

GIF encoding uses the bundled pure-JS [`gifenc`](https://github.com/mattdesl/gifenc) by default (`framesToGif`) — no external tools required, works anywhere `npm install` does. When [`ffmpeg`](https://ffmpeg.org/) is available on `PATH`, `renderScenarioToGif` automatically switches to it instead (`framesToGifWithFfmpeg`), for better color quality via two-pass palette generation; force one or the other with the `encoder` option / `--encoder` flag. `renderScenarioToApng` (`framesToApng`) produces a true 24-bit-color, real-alpha APNG — something `gifenc`'s 256-color GIF palette can't do — and requires ffmpeg (it throws a clear error otherwise). Check availability with `isFfmpegAvailable()`.

This repo's Nix flake provisions ffmpeg for both the devShell and the packaged CLI (`nix run`/`nix build` wrap the binary with it on `PATH`), so Nix users get the better encoder and APNG support automatically; plain `npm install` users can install ffmpeg themselves the same way, or stick with the always-available GIF fallback.

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
