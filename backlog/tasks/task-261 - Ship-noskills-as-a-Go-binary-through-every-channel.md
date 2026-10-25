---
id: TASK-261
title: Ship noskills as a Go binary through every channel
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 14:00'
labels:
  - go
  - distribution
  - noskills
milestone: m-4
dependencies:
  - TASK-257
  - TASK-259
  - TASK-260
  - TASK-251
  - TASK-253
priority: high
ordinal: 261000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add cmd/noskills to `eser dev compile` with noskills-v<ver>-<triple> archives, SHA256SUMS.txt and cosign signing, replacing the M3-T14 noskills stub. Restore the noskills Homebrew formula, install.sh, install.ps1 and a Nix buildGoModule package. Turn the npm `noskills` package into a launcher with per-platform binary packages. The eser npm launcher drops its Node noskills dependency and depends on the noskills launcher instead. `eser noskills` calls the binary.

Decisions this task waits on: decision-8 (What replaces deno compile for the eser, noskills and laroux binaries); decision-9 (What installed v4.5.x laroux and noskills binaries update to); decision-10 (How existing `npx eser@latest noskills` hooks keep working); decision-25 (noskills as its own binary or as part of noskills-server); decision-38 (Release archive names).

Plan key: M4-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dry runs of install.sh, install.ps1, Homebrew and Nix install a working noskills
- [x] #2 A preflight test self-updates from a v4.5.2-named noskills archive to the Go binary
- [ ] #3 `npx noskills --version` and `npx <packed eser> noskills --version` from the packed launchers run the Go binary
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-257: cmd/noskills forwards non-ported commands to 'npx --yes noskills@<version>' as its last fallback. When this task makes the npm noskills package the Go launcher, that fallback resolves to the binary itself; change the lookup (for example to the TS CLI package) so it cannot loop.

2026-10-25.
- Release: ReleaseBinaries builds noskills from ./cmd/noskills (the noskills stub is gone); laroux keeps the stub. ADR 0005 "Installed v4.5.x binaries" records the stub's retirement. The cosign step signs every archive, so signing needs no change.
- Forwarding (the TASK-257 note): cmd/noskills no longer reads ESER_PLUGIN_PATH, which will point at the noskills launcher. Order: NOSKILLS_TS_CLI, NOSKILLS_TS_BUNDLE (set by the npm launcher, run with node), then npx --yes noskills@<version> with NOSKILLS_VIA_NPX=1; a binary that sees NOSKILLS_VIA_NPX=1 refuses a second npx hop. Tests: TestForwardFindsTheTypeScriptCLI, TestForwardMarksTheNpxRun.
- npm: five workspace members @eserstack/noskills-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64} (manifest + README; binary gitignored), optionalDependencies of @eserstack/noskills. `eser dev npm-binaries` (codebasefx.StageNpmBinaries) extracts the binary from the archives into them and refuses a version mismatch. npm-build.ts now writes dist/noskills.js (scripts/npm-launcher.ts: finds the platform package, spawns the binary with NOSKILLS_TS_BUNDLE, passes stdio, exit code and signals) and the TS CLI in dist/ts/; dist/package.json pins ajan-* and noskills-* to the version. Unsupported platform or missing package: a message naming the fix, exit 1. These five names are not on npm yet and need the owner's bootstrap and trusted publishers (docs/agents/release-and-ci.md).
- install.ps1: messages named noskills-server for every product; now "Installing $Product v...", the daemon hints only for noskills-server (test TestInstallPs1NamesTheProductItInstalls, failing first).
- Nix: flake.nix package noskills = buildGoModule from VERSION and a fileset of go.mod, go.sum, cmd, pkg/ajan and third-party, CGO off, doCheck off. vendorHash comes from `eser dev nix-vendor-hash` (go mod vendor + a Go NAR hash, TestNarHashMatchesNix against nix hash path vectors); the precommit step nix-vendor-hash runs it with --check.
- AC #1: install.sh: TestInstallShInstallsTheGoNoskills (fake curl, local release; also refuses a wrong checksum) runs in go test ./.... Homebrew: TestHomebrewFormulaInstallsTheGoNoskills (ESER_HOMEBREW_DRY_RUN=1, temporary tap, file:// URL, brew install and brew test) passed with Homebrew 7.0.10 on macOS arm64. Nix: nix build .#noskills passed in nixos/nix:2.28.3 (aarch64-linux) with the Go-computed vendorHash; the binary reported runtime go. install.ps1: TestInstallPs1InstallsTheGoNoskills (Windows, ESER_INSTALL_PS1_DRY_RUN=1, testdata/install_dry_run.ps1 answers Invoke-RestMethod and Invoke-WebRequest locally) has not run on Windows; under Linux pwsh it got through download, checksum and install and stopped at the registry PATH write, as expected. Open until the windows-smoke step of etc/temp/ci/task-261-ci.patch runs it.
- AC #2: TestLegacyBinariesSelfUpdate (renamed from TestLegacyBinariesUpdateToTheStubs; preflight step legacy-binary-update): the old update.ts updates a v4.5.2 noskills fixture to the Go noskills (version --json runtime go, a hook answered in Go) and laroux to the stub.
- AC #3: `npx noskills --version` and `version --json` from the packed launcher plus platform package, installed outside the repo, run the Go binary, and an unknown command reaches the bundled TS CLI (etc/scripts/preflight-noskills-launcher.ts; preflight steps npm-binaries-current and noskills-launcher-install). The eser half is open: the eser npm launcher is TASK-254 (To Do), and the packed eser is still the TS bundle with noskills inlined. The Go eser with ESER_PLUGIN_PATH at the launcher's .bin runs the Go noskills.
- CI (not applied): etc/temp/ci/task-261-ci.patch. build.yml: smoke-test runs dist/ts/noskills.js --help; compile-binaries stages the noskills binaries and adds the noskills-*-* packages to the ajan-npm-packages artifact; publish-ajan publishes them before noskills; windows-smoke runs the install.ps1 dry run. publish-ajan.yml: stages and uploads or publishes them too, timeout 30. actionlint is clean on the patched files.
- Found: nixpkgs-unstable no longer evaluates x86_64-darwin (every flake package there, eser included); the owner may pin a 26.05-darwin input for it.
- Gates: make ok, deno task cli ok and deno task cli preflight passed.
<!-- SECTION:NOTES:END -->
