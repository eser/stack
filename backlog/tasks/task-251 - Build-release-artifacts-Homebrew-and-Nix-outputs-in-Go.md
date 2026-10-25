---
id: TASK-251
title: 'Build release artifacts, Homebrew and Nix outputs in Go'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 15:33'
labels:
  - go
  - release
  - distribution
  - homebrew
  - nix
milestone: m-3
dependencies:
  - TASK-245
priority: high
ordinal: 251000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision release-build-tool, add `eser dev compile`. It cross-compiles eser, noskills-server and the M3-T14 forwarding stubs for the five targets with CGO_ENABLED=0, and writes `<name>-v<ver>-<triple>` archives and SHA256SUMS.txt. Add `eser dev homebrew` and `eser dev nix-hashes`, or move Nix to buildGoModule per cmd and retire nix/hashes.json and its commit-to-main job. Both update only the formulas and packages whose archives the release contains. Delete cli/scripts/compile.ts and the node updater scripts from M1-T30. The cosign and upload-assets jobs consume the output unchanged.

Decisions this task waits on: decision-8 (What replaces deno compile for the eser, noskills and laroux binaries); decision-38 (Release archive names); decision-39 (Tool for the Go release builds).

Plan key: M3-T10. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `eser dev compile --current-only` builds working host archives whose names match v4.5.2 exactly
- [x] #2 The Homebrew dry run renders the formulas, and `nix build .#eser .#noskills-server` succeeds
- [x] #3 compile.ts and the node updater scripts are deleted
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25.
eser dev compile/homebrew/nix-hashes in Go (decision-39): pkg/ajan/codebasefx/release_artifacts.go and release_distribution.go (!wasip1), plus cmd/eser/dev.go.
- compile: ReleaseTargets (the five Rust triples, also the source of cmd/eser update's table now) x ReleaseBinaries (eser with -X main.version, noskills-server with -X noskillsserverfx.Version). Builds with CGO_ENABLED=0 -trimpath, archives in Go (tar.gz, zip on Windows, the binary at the root, mode 0755, the time from SOURCE_DATE_EPOCH so a rebuild is byte-identical), writes SHA256SUMS.txt, and keeps building past a failure (exit 1). The forwarding stubs are not in ReleaseBinaries: they come with TASK-253.
- homebrew: the formula template is byte-identical to update-homebrew-formula.ts, checked once against the TS renderer on the same placeholder sums. Only binaries with all four Unix archives in SHA256SUMS.txt get a formula; the others are listed as left as they are, and a partial set is an error. Clone/commit/push go to the tap with the token, with credentials redacted from errors. --dry-run, --sums.
- nix-hashes: reads SHA256SUMS.txt instead of downloading each archive (same SHA-256, the file fetchurl checks). Writes nix/hashes.json as {version, <binary>: {triple: sri}}, for eser and noskills-server when the release has them. flake.nix now takes the version from hashes.json and packages every binary the file lists (mkBinary), default = eser when present. nix/hashes.json was migrated to the new shape with the v4.5.2 eser hashes.
AC #1: TestCompileReleaseWritesTheV452Names asserts the exact v4.5.2 asset names and SHA256SUMS lines. TestCompileReleaseBuildsWorkingHostBinaries runs the real go build for the host, extracts both archives, and runs each binary's --version. TestDevCompileArchiveIsWhatUpdateReads shows the archive is what 'eser update' extracts.
AC #2: half done. The Homebrew dry run renders (tests, and the preflight step 'go run ./cmd/eser dev homebrew --dry-run'). 'nix build .#eser .#noskills-server' was NOT run: Nix is not installed here and no CI job runs it. The flake edit is unverified and needs one nix build on a machine with Nix; noskills-server appears once a release's hashes.json lists it.
AC #3: deleted pkg/@eserstack/cli/scripts/compile.ts, etc/scripts/update-homebrew-formula.ts and update-nix-hashes.ts. Their contract test release-naming.test.ts is ported to codebasefx/release_naming_test.go: archive names against install.sh/install.ps1, accept-lists against ReleaseBinaries plus laroux/noskills (awaiting TASK-253), and the distribution and flake triples are built. dist-utils.ts keeps only repoRootFrom (preflight-npm-consumer uses it). The manifest's compile script and the homebrew/nix/compile preflight steps run the Go commands; docs updated (ARCHITECTURE, CONTRIBUTING, docs/agents/release-and-ci.md, cmd/eser README).
Waiting on the owner: etc/temp/ci/task-251-ci.patch (gitignored, applies after task-188 and task-189; checked as a chain). It switches 'Compile for all platforms' to 'SOURCE_DATE_EPOCH=1791179796 go run ./cmd/eser dev compile', and update-homebrew/update-nix-hashes to setup-go plus go run ./cmd/eser dev homebrew|nix-hashes (timeout 10 minutes for the compile). Until it is applied, build.yml still calls the deleted scripts.
Release impact to know before the next tag: the next release ships Go eser and noskills-server archives only. The deno-compiled noskills and laroux binaries are no longer built, so installed v4.5.x noskills/laroux binaries find no update archive and their Homebrew formulas stay at their version until TASK-253's stubs land (decision-8).
Gates: make ok and deno task cli ok passed.

2026-10-25: the owner approved applying the CI patches. etc/temp/ci/task-{188,189,249,251,264}-ci.patch were applied in that order to .github/workflows (build.yml, publish-ajan.yml, update-contributors.yml); actionlint is clean; make ok and deno task cli ok passed. build.yml now runs 'go run ./cmd/eser dev homebrew' and 'dev nix-hashes' instead of the deleted scripts. AC #2 still needs 'nix build .#eser .#noskills-server' on a machine with Nix (none here); the release workflow's update-nix-hashes job exercises the hashes on the next release.

2026-10-25, nix build checked in a nixos/nix:2.28.3 container (aarch64-linux), on a copy of flake.nix and nix/ with hashes.json pointed at v4.5.1 (built from that release's SHA256SUMS.txt), since v4.5.2 has no release assets at all (gh api: 0 assets; HEAD's flake pointed at v4.5.2 too, so 'nix build' of the repo has failed with a 404 since that release). With v4.5.1 both .#eser and .#noskills-server built; noskills-server --version ran, but eser failed with 'Could not find standalone binary section': the fixup phase strips the binary and strip drops the section deno compile keeps the program in. Fixed in flake.nix with dontStrip = true in mkBinary; after it both outputs and .#default build and both binaries run. AC #2 stays open: the repo's own hashes.json names v4.5.2, whose archives were never uploaded, and no release yet lists noskills-server in hashes.json; it passes as is once a release with assets runs the update-nix-hashes job (or the owner points hashes.json at v4.5.1).

2026-10-25: the owner chose to point nix/hashes.json at v4.5.1 (v4.5.2 has no release assets). Generated with 'eser dev nix-hashes --sums SHA256SUMS.txt' (v4.5.1's file) in a scratch directory whose VERSION was 4.5.1, so the repo's VERSION is unchanged; it now lists eser and noskills-server. On the repo's flake.nix and nix/, 'nix build .#eser' and '.#noskills-server' succeed in a nixos/nix:2.28.3 container (aarch64-linux) and both binaries run (eser --version, noskills-server 4.5.1). The next release's update-nix-hashes job rewrites the file.
<!-- SECTION:NOTES:END -->
