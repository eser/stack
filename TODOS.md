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

## P2 — Backpressure-aware web sink defaults

**What:** When web sinks (httpResponse, webSocket) ship for @eser/streams,
configure sensible timeout and backpressure defaults.

**Why:** Pipeline timeout (in MVP) handles abort, but web sinks need per-sink
backpressure thresholds and configurable timeout defaults to prevent silent
hangs in production.

**Context:** The @eser/streams MVP ships with stdout/buffer/null sinks (all
fast). When web sinks arrive, they face real backpressure from network
conditions. The pipeline timeout mechanism provides the abort, but each web sink
needs sensible defaults for buffer size limits and timeout durations.

**Effort:** S (CC: ~15 min per sink)

**Depends on:** @eser/streams MVP (pipeline timeout)
