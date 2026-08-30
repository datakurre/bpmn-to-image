{
  description = "Render BPMN 2.0 XML to SVG or PNG headlessly (bpmn-js via jsdom)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        packageJson = builtins.fromJSON (builtins.readFile ./package.json);

        bpmn-to-image = pkgs.buildNpmPackage {
          pname = packageJson.name;
          version = packageJson.version;

          src = ./.;

          # Generated from package-lock.json via `nix build`/`prefetch-npm-deps`.
          # After changing package-lock.json, run `nix build` once: it fails
          # with a hash mismatch that prints the correct value to paste here.
          npmDepsHash = "sha256-h5aCxzgU4oaR6mMRx5J65AkX6VwRT7imVmMRcTCDNFk=";

          npmBuildScript = "build";

          meta = {
            description = "Render BPMN 2.0 XML to SVG or PNG headlessly, using bpmn-js via jsdom";
            homepage = "https://github.com/datakurre/bpmn-to-image";
            license = pkgs.lib.licenses.mit;
            mainProgram = "bpmn-to-image";
          };
        };
      in
      {
        packages.default = bpmn-to-image;
        packages.bpmn-to-image = bpmn-to-image;

        apps.default = flake-utils.lib.mkApp {
          drv = bpmn-to-image;
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
          ];
        };

        checks.default = bpmn-to-image;
      }
    );
}
