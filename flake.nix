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

        eser = pkgs.stdenv.mkDerivation {
          pname = "eser";
          inherit version src;

          sourceRoot = ".";

          nativeBuildInputs = pkgs.lib.optionals isLinux [
            pkgs.autoPatchelfHook
          ];

          buildInputs = pkgs.lib.optionals isLinux [
            pkgs.stdenv.cc.cc.lib
          ];

          installPhase = ''
            mkdir -p $out/bin
            cp eser $out/bin/eser
            chmod +x $out/bin/eser
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
            git
          ];
        };
      }
    );
}
