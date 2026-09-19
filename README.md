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
- `-f, --format <svg|png|html|gif|apng|mp4|webp>` — output format. Inferred from the output file extension when omitted; defaults to `svg` for stdout. `apng`/`mp4`/`webp` require ffmpeg. `html` renders a self-contained, interactive simulator embed (see [Interactive embed](#interactive-embed)) instead of a headless render.
- `-s, --scale <number>` — pixel density multiplier (PNG or an animated format). Default: `2`.
- `-b, --background <color>` — background color (CSS string, e.g. `white`, `#FFFFFF`, `#fafafa`). Default: transparent for SVG/PNG/GIF/APNG/WebP, and `white` for MP4 (which does not support transparency).
- `--scenario <file>` — steer the animation with this TOML scenario file (see [Animated executions](#animated-executions)). Omit it and animated formats render the diagram's own default scenario instead.
- `--frames <dir>` — export individual token-simulation frames into a directory. Defaults to SVG; combine with `--format png` for PNG frames. `--export-frames` is an alias.
- `--fps <number>` — animation frame rate, overriding both `--smooth` and the scenario's own `fps` (default: `12`). Higher values trade smoother token motion for proportionally more frames to render.
- `--max-duration <ms>` — maximum simulated duration before stopping (default: `30000`). Increase this for scenarios that legitimately run longer than 30 seconds.
- `--smooth` — render at a smoother preset frame rate (30fps) instead of the fast default — for the final render once you're happy with a scenario, after iterating on it at the cheaper default.
- `--encoder <auto|gifenc|ffmpeg>` — GIF-only encoder choice. `auto` (default) prefers ffmpeg (better palette quality, smaller files) when it's on `PATH`, falling back to the bundled pure-JS `gifenc` otherwise.
- `--export-scenario` — write a scenario TOML scaffold for the input diagram instead of rendering an image.
- `--id <string>` — DOM id for the `--format html` container element. Default: a short hash of the diagram XML, so repeated builds of the same diagram produce identical output.
- `--width <css-length>` — with `--format html`, container width (e.g. `600px`, `80%`). Default: `100%`.
- `--height <css-length>` — with `--format html`, container height (e.g. `60%`). Default: none — a 400px `min-height` floor instead, growing to fill a flex/grid box on the host page; an explicit height opts out of that growth, like on a plain `<img>`/`<video>`.
- `--align <left|center|right>` — with `--format html`, horizontal alignment when the container doesn't fill the full width available to it (e.g. an explicit `--width`).
- `--no-assets` — with `--format html`, omit the shared `<style>` + `<script>` bundle and emit only the small per-diagram container + init call. Use for every diagram after the first on a page that already loaded the assets.
- `--print-viewer-assets` — write just the shared `<style>` + `<script>` bundle that `--format html` embeds, and exit — no input is read.

Rendering an animated format prints a live progress bar to stderr (when it's a TTY — never mixed into piped/redirected output).

```bash
bpmn-to-image diagram.bpmn diagram.svg
bpmn-to-image diagram.bpmn diagram.png
bpmn-to-image --background white diagram.bpmn diagram.png
cat diagram.bpmn | bpmn-to-image --format png > diagram.png
bpmn-to-image --scenario scenario.toml --frames frames diagram.bpmn
bpmn-to-image --scenario scenario.toml --frames frames --format png diagram.bpmn
bpmn-to-image --format html diagram.bpmn diagram.html
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

By default, token simulation advances through tasks immediately. You can configure tasks to pause for a fixed duration, displaying a bouncing token animation before proceeding:

- Set `task_pause_ms` at the scenario level (e.g. `task_pause_ms = 500`) to pause every task/activity entered by a token.
- Or configure `pause_ms` on individual `[[token.step]]` entries (e.g. `element = "Task_1"`, `pause_ms = 1000`) to pause specific tasks, or override the scenario default (`pause_ms = 0` to skip pausing on a specific task).

Generate a scenario scaffold for a diagram — it walks the diagram's actual control flow (one token per start event, following the default/first-outgoing path, matching what the interactive tool does with no clicks at all) so you start from real element ids and a runnable default, not a blank file:

```bash
bpmn-to-image --export-scenario diagram.bpmn diagram.toml
```

```toml
fps = 12
task_pause_ms = 500 # optional: pause tasks with bouncing token animation

[[token]]
name = "request-received-1"

  [[token.step]]
  element = "StartEvent_1" # Request received
  at_ms = 0

  [[token.step]]
  element = "Activity_review" # Review request
  pause_ms = 1000 # override pause duration for this task

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

The CLI frame export writes zero-padded files named `frame-0000.svg` (or `.png`) in simulation order. PNG frames use the same `--scale` and `--background` options as static PNG output.

Token motion is real interpolated animation (not a jump per gateway/event), sampled at a fixed frame rate — the scenario's `fps` field, `smooth`/`--smooth`, or `fps`/`--fps` itself (each overriding the last in that order). Raising it renders more, smoother frames at proportionally higher cost; the default (`12`, `DEFAULT_FPS`) is fast enough for iterating on a scenario. Once you're happy with it, `smooth: true` / `--smooth` re-renders at a smoother preset (`30`, `SMOOTH_FPS`) for the version you'll actually share — `fps`/`--fps` still wins if you want a specific number instead. ffmpeg has no role in getting there — each frame already comes from the real simulated position, so there's nothing to interpolate between; ffmpeg's motion-interpolation filters are for guessing motion in footage that lacks it, and would only degrade flat vector art here.

### Output formats and file size

GIF encoding uses the bundled pure-JS [`gifenc`](https://github.com/mattdesl/gifenc) by default (`framesToGif`) — no external tools required, works anywhere `npm install` does. When [`ffmpeg`](https://ffmpeg.org/) is available on `PATH`, `renderScenarioToGif` automatically switches to it instead (`framesToGifWithFfmpeg`), building its palette from _changed_ pixels across frames (`palettegen=stats_mode=diff`) and disabling dithering (`paletteuse=dither=none`) — both a size and a quality win for a mostly-static diagram with one small moving token, since dithering noise compresses far worse than flat color runs. Force one encoder or the other with the `encoder` option / `--encoder` flag.

Three formats need ffmpeg outright (`gifenc` can't produce them) and throw a clear error without it:

- `renderScenarioToApng` (`framesToApng`) — true 24-bit color and real alpha, unlike GIF's 256-color palette.
- `renderScenarioToMp4` (`framesToMp4`) — H.264 video, far smaller than GIF/APNG for the same animation; the tradeoff is it won't auto-play as universally as a GIF does when embedded.
- `renderScenarioToWebp` (`framesToWebp`) — animated WebP, smaller than GIF at comparable quality.

Check ffmpeg availability with `isFfmpegAvailable()`. This repo's Nix flake provisions ffmpeg for both the devShell and the packaged CLI (`nix run`/`nix build` wrap the binary with it on `PATH`), so Nix users get all of the above automatically; plain `npm install` users can install ffmpeg themselves the same way, or stick with the always-available GIF fallback.

## Interactive embed

Instead of a pre-rendered image or animation, `--format html` produces a self-contained HTML fragment that runs the token simulation live, in the viewer's own browser: a read-only [`NavigatedViewer`](https://bpmn.io/toolkit/bpmn-js/) with [bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation)'s viewer module (play/pause, no palette or editing), plus the same robot-task icon rendering as the headless renderer. There's no scenario to script — like the interactive tool itself, it auto-advances through tasks and waits for a click at any gateway with more than one outgoing flow.

The embed auto-enters simulation mode on load and hides bpmn-js-token-simulation's fixed UI chrome — the "Token Simulation" toggle pill, the play/pause + reset + log-toggle button column, the log panel, the animation-speed control, the scope-filter token list, and the transient toast log — so only the buttons bpmn-js-token-simulation draws directly on the diagram (start/trigger buttons, gateway decision arrows) are visible, plus a small "fit to view" button in the corner. The "Powered by bpmn.io" attribution link stays, per [bpmn.io's free-use license](https://bpmn.io/license/). The "Finished" label a completed process pops onto its end element loses its text — redundant with the diagram's own end event right next to it — leaving just its icon as a small badge; the "Not supported" warning for an element type token simulation can't drive keeps its text, since it actually has something to say.

The colors bpmn-js-token-simulation uses to distinguish a gateway's "selected" vs. "not selected" outgoing flow (among other things) are read via `getComputedStyle(document.documentElement)` — which needs those custom properties to resolve on `<html>` itself, not merely be inherited wherever the diagram sits. That can silently fail deep inside a host page's own complex layout (observed with a Marp deck's per-slide `<svg><foreignObject>` wrapping), collapsing every outgoing flow to the same color with no visible cause. The embed sets these directly as inline styles on `<html>` (only filling in names the host page hasn't already resolved) to sidestep that.

The diagram is fit to its container on load (and again on that fit button) by setting the canvas viewbox directly to the diagram's own bounds, rather than `canvas.zoom('fit-viewport')` — which never zooms in past 100%, so a small diagram in a large container (a full slide, say) would otherwise sit at a fraction of the available size. The embed's UI text also gets its own fixed `font-size`, rather than inheriting the host page's — a slide deck's body text is typically much larger than a normal page's, which would otherwise blow the token-number label out of its circle.

```bash
bpmn-to-image --format html diagram.bpmn diagram.html
```

The output is one `<span>` (the container bpmn-js attaches to — `display:block`, but a `<span>` rather than a `<div>` so it stays valid as the sole content of a Markdown paragraph) + two `<script>`/`<style>` blocks with everything inlined (a minified JS bundle, minified CSS, and the diagram XML as base64) — drop it into any page and it runs. Embedding more than one diagram on the same page, inline each bundle only once:

```bash
bpmn-to-image --print-viewer-assets assets.html                       # once per page
bpmn-to-image --format html --no-assets diagram-a.bpmn a.html         # per diagram
bpmn-to-image --format html --no-assets diagram-b.bpmn b.html
```

Or from the library:

```ts
import { renderInteractiveAssetsHtml, renderInteractiveDiagramHtml } from 'bpmn-to-image';

const assetsHtml = renderInteractiveAssetsHtml(); // emit once per page
const diagramHtml = renderInteractiveDiagramHtml(xml, { id: 'my-diagram', background: 'white' });
```

`renderInteractiveHtml(xml, options)` combines both into the single self-contained fragment the CLI writes by default; pass `{ includeAssets: false }` to get just the per-diagram fragment instead.

`InteractiveViewerOptions` also takes `width`, `height`, and `align` (`'left' | 'center' | 'right'`), mirroring `--width`/`--height`/`--align` above — an explicit `height` (or `width`) adds a `bpmn-simulator-sized` class alongside `bpmn-simulator`, so a host stylesheet can tell "an explicit size was requested" apart from the always-present default `width: 100%` and opt the container out of any fill-available-space layout it otherwise gives `.bpmn-simulator`.

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
