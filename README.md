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
- `-f, --format <svg|png|gif|apng|mp4|webp>` — output format. Inferred from the output file extension when omitted; defaults to `svg` for stdout. `apng`/`mp4`/`webp` require ffmpeg.
- `-s, --scale <number>` — pixel density multiplier (PNG or an animated format). Default: `2`.
- `-b, --background <color>` — background color (CSS string, e.g. `white`, `#FFFFFF`, `#fafafa`). Default: transparent for SVG/PNG/GIF/APNG/WebP, and `white` for MP4 (which does not support transparency).
- `--scenario <file>` — steer the animation with this TOML scenario file (see [Animated executions](#animated-executions)). Omit it and animated formats render the diagram's own default scenario instead.
- `--fps <number>` — animation frame rate, overriding both `--smooth` and the scenario's own `fps` (default: `12`). Higher values trade smoother token motion for proportionally more frames to render.
- `--smooth` — render at a smoother preset frame rate (30fps) instead of the fast default — for the final render once you're happy with a scenario, after iterating on it at the cheaper default.
- `--encoder <auto|gifenc|ffmpeg>` — GIF-only encoder choice. `auto` (default) prefers ffmpeg (better palette quality, smaller files) when it's on `PATH`, falling back to the bundled pure-JS `gifenc` otherwise.
- `--export-scenario` — write a scenario TOML scaffold for the input diagram instead of rendering an image.

Rendering an animated format prints a live progress bar to stderr (when it's a TTY — never mixed into piped/redirected output).

```bash
bpmn-to-image diagram.bpmn diagram.svg
bpmn-to-image diagram.bpmn diagram.png
bpmn-to-image --background white diagram.bpmn diagram.png
cat diagram.bpmn | bpmn-to-image --format png > diagram.png
```

## Library

```ts
import { renderToSvg, renderToPng } from 'bpmn-to-image';
import { readFileSync } from 'node:fs';

const xml = readFileSync('diagram.bpmn', 'utf-8');

const svg = await renderToSvg(xml);
const png = await renderToPng(xml, { scale: 2, background: 'white' });
```

Both functions accept an optional `background` color and `moddleExtensions` map (merged with the built-in [Camunda 7 / Operaton](https://docs.camunda.org/manual/7.24/) moddle extension) for diagrams that use other BPMN extension namespaces.

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

Then render the animation — `--scenario` is optional; without it, an animated format renders the diagram's own default scenario (same as `--export-scenario` would generate: one token per start event, first outgoing flow at every gateway):

```bash
bpmn-to-image diagram.bpmn diagram.gif                          # default scenario
bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.gif
bpmn-to-image --scenario diagram.toml --smooth diagram.bpmn diagram-final.gif
bpmn-to-image --scenario diagram.toml diagram.bpmn diagram.apng  # requires ffmpeg
bpmn-to-image diagram.bpmn diagram.mp4                           # requires ffmpeg
bpmn-to-image diagram.bpmn diagram.webp                          # requires ffmpeg
```

Or from the library:

```ts
import { renderScenarioToGif } from 'bpmn-to-image';

const gif = await renderScenarioToGif(xml); // default scenario
// or: await renderScenarioToGif(xml, await exportScenarioTemplate(xml)); // or hand-written TOML
```

`renderScenarioFrames` (SVG frames + timing, no encoding) is also exported for custom pipelines, along with an `onProgress` option (`{ phase: 'simulate' | 'rasterize', current, total }`) accepted by every render function — the CLI uses it to draw its terminal progress bar.

Token motion is real interpolated animation (not a jump per gateway/event), sampled at a fixed frame rate — the scenario's `fps` field, `smooth`/`--smooth`, or `fps`/`--fps` itself (each overriding the last in that order). Raising it renders more, smoother frames at proportionally higher cost; the default (`12`, `DEFAULT_FPS`) is fast enough for iterating on a scenario. Once you're happy with it, `smooth: true` / `--smooth` re-renders at a smoother preset (`30`, `SMOOTH_FPS`) for the version you'll actually share — `fps`/`--fps` still wins if you want a specific number instead. ffmpeg has no role in getting there — each frame already comes from the real simulated position, so there's nothing to interpolate between; ffmpeg's motion-interpolation filters are for guessing motion in footage that lacks it, and would only degrade flat vector art here.

### Output formats and file size

GIF encoding uses the bundled pure-JS [`gifenc`](https://github.com/mattdesl/gifenc) by default (`framesToGif`) — no external tools required, works anywhere `npm install` does. When [`ffmpeg`](https://ffmpeg.org/) is available on `PATH`, `renderScenarioToGif` automatically switches to it instead (`framesToGifWithFfmpeg`), building its palette from _changed_ pixels across frames (`palettegen=stats_mode=diff`) and disabling dithering (`paletteuse=dither=none`) — both a size and a quality win for a mostly-static diagram with one small moving token, since dithering noise compresses far worse than flat color runs. Force one encoder or the other with the `encoder` option / `--encoder` flag.

Three formats need ffmpeg outright (`gifenc` can't produce them) and throw a clear error without it:

- `renderScenarioToApng` (`framesToApng`) — true 24-bit color and real alpha, unlike GIF's 256-color palette.
- `renderScenarioToMp4` (`framesToMp4`) — H.264 video, far smaller than GIF/APNG for the same animation; the tradeoff is it won't auto-play as universally as a GIF does when embedded.
- `renderScenarioToWebp` (`framesToWebp`) — animated WebP, smaller than GIF at comparable quality.

Check ffmpeg availability with `isFfmpegAvailable()`. This repo's Nix flake provisions ffmpeg for both the devShell and the packaged CLI (`nix run`/`nix build` wrap the binary with it on `PATH`), so Nix users get all of the above automatically; plain `npm install` users can install ffmpeg themselves the same way, or stick with the always-available GIF fallback.

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
