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

## P2 — `concern list` tension warnings

**What:** Wire `detectTensions()` into the `concern list` CLI command so it
prints warnings when active concerns conflict (e.g. move-fast ↔ compliance).

**Why:** `detectTensions()` already exists in the codebase. The CLI plumbing is
the only missing piece. Visible warnings help developers understand trade-offs
before starting a spec.

**Context:** Identified during noskills UX plan review. detectTensions() is
implemented but not called from the concern list output path.

**Effort:** XS (CC: ~30 min)

## P3 — `noskills --about` command

**What:** Add a `--about` flag that prints the eserstack philosophy in 3
sentences and exits.

**Why:** Surfaces the philosophy from the CLI without requiring a browser. Quick
reminder of why noskills exists.

**Effort:** XS

## P3 — `noskills init` banner philosophy reference

**What:** Update the `noskills init` banner to include a one-line reference to
"Built on eserstack foundation layer."

**Why:** Reinforces the product identity at the first moment of use.

**Effort:** XS

## P2 — Backpressure-aware web sink defaults

**What:** When web sinks (httpResponse, webSocket) ship for @eserstack/streams,
configure sensible timeout and backpressure defaults.

**Why:** Pipeline timeout (in MVP) handles abort, but web sinks need per-sink
backpressure thresholds and configurable timeout defaults to prevent silent
hangs in production.

**Context:** The @eserstack/streams MVP ships with stdout/buffer/null sinks (all
fast). When web sinks arrive, they face real backpressure from network
conditions. The pipeline timeout mechanism provides the abort, but each web sink
needs sensible defaults for buffer size limits and timeout durations.

**Effort:** S (CC: ~15 min per sink)

**Depends on:** @eserstack/streams MVP (pipeline timeout)
