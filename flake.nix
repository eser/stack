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

        version = builtins.replaceStrings ["\n" " "] ["" ""] (builtins.readFile ./VERSION);

        hashes = builtins.fromJSON (builtins.readFile ./nix/hashes.json);

        targetMap = {
          x86_64-linux = "x86_64-unknown-linux-gnu";
          aarch64-linux = "aarch64-unknown-linux-gnu";
          x86_64-darwin = "x86_64-apple-darwin";
          aarch64-darwin = "aarch64-apple-darwin";
        };

        target = targetMap.${system};

        src = pkgs.fetchurl {
          url = "https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-${target}.tar.gz";
          hash = hashes.${target};
        };

        isLinux = builtins.elem system [ "x86_64-linux" "aarch64-linux" ];
        isDarwin = builtins.elem system [ "x86_64-darwin" "aarch64-darwin" ];

        # Platform-appropriate shared library extension
        sharedLibExt = if isDarwin then "dylib" else "so";
        sharedLibName = "libeser_ajan.${sharedLibExt}";

        # Environment variable for shared library lookup
        libPathVar = if isDarwin then "DYLD_LIBRARY_PATH" else "LD_LIBRARY_PATH";

        eser = pkgs.stdenv.mkDerivation {
          pname = "eser";
          inherit version src;

          sourceRoot = ".";

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

            # Install the main binary
            cp eser $out/bin/eser
            chmod +x $out/bin/eser

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
              wrapProgram $out/bin/eser \
                --set ${libPathVar} "$out/lib"
            fi
          '';

          meta = with pkgs.lib; {
            description = "eser - Eser's swiss-army-knife tooling for your terminal";
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
      in
      {
        packages = {
          default = eser;
          eser = eser;
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
