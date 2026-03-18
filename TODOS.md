# TODOs

Tracked deferred work for the eserstack project.

## P2 — Submit to nixpkgs upstream

**What:** Submit the `eser` package to the official nixpkgs repository.

**Why:** Enables `nix-env -iA nixpkgs.eser` without needing the flake URL.
Significantly increases discoverability for Nix users.

**Context:** The in-repo `flake.nix` downloads pre-built binaries from GitHub
Releases. An upstream nixpkgs package would do the same but be maintained by the
nixpkgs community. Requires a stable release history (2-3 releases with binary
assets) and passing the nixpkgs review process.

**Effort:** M (mostly waiting for maintainer review)

**Depends on:** Stable binary distribution pipeline (shipped in current release)

## P3 — Scoop / winget for Windows

**What:** Add Windows package manager support via Scoop manifest and/or winget
manifest.

**Why:** The CI already compiles a Windows binary (`x86_64-pc-windows-msvc`).
Adding Scoop/winget makes it discoverable by Windows developers.

**Context:** A Scoop manifest is a JSON file in a "bucket" repo (similar to
Homebrew tap). A winget manifest requires submission to the
`microsoft/winget-pkgs` repository. Both are straightforward once binary
distribution is stable.

**Effort:** S per manager (~1 hour each)

**Depends on:** Stable binary distribution pipeline
