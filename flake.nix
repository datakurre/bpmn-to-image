{
  description = "Render BPMN 2.0 XML to SVG or PNG headlessly (bpmn-js via jsdom)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    let
      overlay = final: prev: {
        bpmn-to-image = final.callPackage ./nix/package.nix { };
      };
    in
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
      in
      {
        packages.default = pkgs.bpmn-to-image;
        packages.bpmn-to-image = pkgs.bpmn-to-image;

        apps.default = flake-utils.lib.mkApp {
          drv = pkgs.bpmn-to-image;
          name = "bpmn-to-image";
        };

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22

            # Fonts for SVG-to-PNG rendering (resvg-js needs font files to
            # rasterize text labels; the package also bundles Liberation Sans
            # as a fallback, so these are only needed for closer Arial metrics
            # / broader Unicode coverage during local development).
            pkgs.liberation_ttf
            pkgs.dejavu_fonts

            # Optional runtime enhancement for animated GIF/APNG rendering
            # (see src/token-simulation/ffmpeg.ts): when `ffmpeg` is on PATH,
            # animations use its two-pass palette GIF encoder (better color
            # quality than the bundled pure-JS gifenc) and APNG becomes
            # available. Detected at runtime — plain `npm install` users
            # without ffmpeg still get a working (gifenc-only) GIF encoder.
            pkgs.ffmpeg-headless
          ];
        };

        checks.default = pkgs.bpmn-to-image;
      }
    )
    // {
      overlays.default = overlay;
    };
}
