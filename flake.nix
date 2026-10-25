{
  description = "eser - Eser's swiss-army-knife tooling for your terminal";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ] (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Written by `eser dev nix-hashes` after each release: the released
        # version and, per binary whose archives the release has, the hash of
        # each archive. A binary is packaged only when it is listed here.
        hashes = builtins.fromJSON (builtins.readFile ./nix/hashes.json);

        version = hashes.version;

        binaries = builtins.removeAttrs hashes [ "version" ];

        targetMap = {
          x86_64-linux = "x86_64-unknown-linux-gnu";
          aarch64-linux = "aarch64-unknown-linux-gnu";
          x86_64-darwin = "x86_64-apple-darwin";
          aarch64-darwin = "aarch64-apple-darwin";
        };

        target = targetMap.${system};

        isLinux = builtins.elem system [ "x86_64-linux" "aarch64-linux" ];
        isDarwin = builtins.elem system [ "x86_64-darwin" "aarch64-darwin" ];

        # Platform-appropriate shared library extension
        sharedLibExt = if isDarwin then "dylib" else "so";
        sharedLibName = "libeser_ajan.${sharedLibExt}";

        # Environment variable for shared library lookup
        libPathVar = if isDarwin then "DYLD_LIBRARY_PATH" else "LD_LIBRARY_PATH";

        mkBinary = name: targetHashes: pkgs.stdenv.mkDerivation {
          pname = name;
          inherit version;

          src = pkgs.fetchurl {
            url = "https://github.com/eser/stack/releases/download/v${version}/${name}-v${version}-${target}.tar.gz";
            hash = targetHashes.${target};
          };

          sourceRoot = ".";

          # deno compile keeps the program in an ELF/Mach-O section that strip
          # removes, so the release binaries are installed unstripped.
          dontStrip = true;

          nativeBuildInputs = [
            pkgs.makeWrapper
          ] ++ pkgs.lib.optionals isLinux [
            pkgs.autoPatchelfHook
          ];

          buildInputs = pkgs.lib.optionals isLinux [
            pkgs.stdenv.cc.cc.lib
          ];

          installPhase = ''
            mkdir -p $out/bin

            # Install the binary
            cp ${name} $out/bin/${name}
            chmod +x $out/bin/${name}

            # Install the Go shared library if present in the archive
            if [ -f "${sharedLibName}" ]; then
              mkdir -p $out/lib
              cp ${sharedLibName} $out/lib/${sharedLibName}
              chmod +x $out/lib/${sharedLibName}
            fi

            # Install the C header if present in the archive
            if [ -f "libeser_ajan.h" ]; then
              mkdir -p $out/include
              cp libeser_ajan.h $out/include/libeser_ajan.h
            fi
          '';

          # Wrap the binary so it can find the shared library at runtime
          postFixup = ''
            if [ -f "$out/lib/${sharedLibName}" ]; then
              wrapProgram $out/bin/${name} \
                --set ${libPathVar} "$out/lib"
            fi
          '';

          meta = with pkgs.lib; {
            description = descriptions.${name} or name;
            homepage = "https://github.com/eser/stack";
            license = licenses.asl20;
            platforms = [
              "x86_64-linux"
              "aarch64-linux"
              "x86_64-darwin"
              "aarch64-darwin"
            ];
          };
        };

        descriptions = {
          eser = "eser - Eser's swiss-army-knife tooling for your terminal";
          noskills-server = "noskills-server - persistent Claude Code sessions that survive reboots";
        };

        # noskills is built from this source tree (TASK-261), at the version
        # in VERSION, with cgo off like the release archives. vendorHash
        # follows go.sum: `go run ./cmd/eser dev nix-vendor-hash` rewrites it,
        # and the precommit workflow checks it.
        noskills = pkgs.buildGoModule {
          pname = "noskills";
          version = pkgs.lib.fileContents ./VERSION;

          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./go.mod
              ./go.sum
              ./cmd
              ./pkg/ajan
              ./third-party
            ];
          };

          vendorHash = "sha256-Eow+/iep1OP2N3wgXmrPfQA94PoGeZLYyphG62gYTgE=";

          subPackages = [ "cmd/noskills" ];

          env.CGO_ENABLED = "0";

          ldflags = [
            "-s"
            "-w"
            "-X main.version=${pkgs.lib.fileContents ./VERSION}"
          ];

          # The gate runs the tests; some start git and fake agent CLIs that
          # the build sandbox does not have.
          doCheck = false;

          meta = with pkgs.lib; {
            description = "noskills - state-machine orchestrator for AI agents";
            homepage = "https://github.com/eser/stack";
            license = licenses.asl20;
            mainProgram = "noskills";
          };
        };

        packages = builtins.mapAttrs mkBinary binaries // {
          inherit noskills;
        };
      in
      {
        packages = packages // pkgs.lib.optionalAttrs (packages ? eser) {
          default = packages.eser;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            deno
            go
            nodejs
            bun
            git
          ];
        };
      }
    );
}
