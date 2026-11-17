---
id: TASK-402
title: 'eser: move the release build commands from eser dev to eser codebase dist'
status: Done
assignee: []
created_date: '2026-11-17 07:54'
updated_date: '2026-11-17 08:01'
labels:
  - cli
  - codebase
  - release
milestone: m-3
dependencies: []
priority: medium
ordinal: 405000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`eser dev` holds compile, homebrew, nix-hashes, nix-vendor-hash and npm-binaries: release build tools that only work in this repository, but they ship in the eser binary every user installs, and the name reads like a dev server (that is `laroux dev`). Move them under `eser codebase dist`, next to `eser codebase release`, and remove `eser dev`.

Callers to move with it: .eser/manifest.yml (precommit nix-vendor-hash, preflight compile, npm-binaries, homebrew and nix-hashes, the compile script), .github/workflows/build.yml (compile-binaries, update-homebrew, update-nix-hashes), .github/workflows/publish-ajan.yml, flake.nix comments, cmd/eser/README.md, cmd/legacy-forwarder and cmd/noskills comments, .github/ARCHITECTURE.md, .github/CONTRIBUTING.md, docs/agents/release-and-ci.md, docs/agents/languages-and-security.md and the release-and-ci skill. CHANGELOG entries and accepted ADRs stay as written.

A post-publish dispatch for a tag cut before this change runs the workflow from main on that tag's tree, which has no `eser codebase dist`; v5.0.0 is fully published, so no such re-run is due.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 eser codebase dist compile, homebrew, nix-hashes, nix-vendor-hash and npm-binaries behave as eser dev's commands did, with the same flags
- [x] #2 eser dev no longer exists, and no file outside CHANGELOG.md, backlog/ and docs/adr/ names it
- [x] #3 pnpm ok passes and pnpm preflight runs the moved commands
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved cmd/eser/dev.go, dev_packages.go and dev_test.go to codebase_dist*.go; distCommand is a subcommand of codebaseCommand. TestDistReplacesTheDevCommand checks that `eser dev` is gone. Verified: pnpm ok, and the preflight steps codebase dist homebrew --dry-run, nix-hashes --dry-run, compile --current-only and npm-binaries run on the host.
<!-- SECTION:NOTES:END -->
