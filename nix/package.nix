{
  lib,
  buildNpmPackage,
  makeWrapper,
  ffmpeg-headless,
}:

let
  packageJson = builtins.fromJSON (builtins.readFile ../package.json);
in
buildNpmPackage {
  pname = packageJson.name;
  version = packageJson.version;

  src = ../.;

  # Generated from package-lock.json via `nix build`/`prefetch-npm-deps`.
  # After changing package-lock.json, run `nix build` once: it fails
  # with a hash mismatch that prints the correct value to paste here.
  npmDepsHash = "sha256-h5aCxzgU4oaR6mMRx5J65AkX6VwRT7imVmMRcTCDNFk=";

  npmBuildScript = "build";

  nativeBuildInputs = [ makeWrapper ];

  # Optional runtime enhancement (see src/token-simulation/ffmpeg.ts): put
  # ffmpeg on the wrapped binary's PATH so animated GIF/APNG rendering uses
  # its two-pass palette encoder automatically, without making it a hard
  # npm dependency for `npm install` users who don't have ffmpeg.
  postInstall = ''
    wrapProgram $out/bin/${packageJson.name} \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg-headless ]}
  '';

  meta = {
    description = "Render BPMN 2.0 XML to SVG or PNG headlessly, using bpmn-js via jsdom";
    homepage = "https://github.com/datakurre/bpmn-to-image";
    license = lib.licenses.mit;
    mainProgram = "bpmn-to-image";
  };
}
