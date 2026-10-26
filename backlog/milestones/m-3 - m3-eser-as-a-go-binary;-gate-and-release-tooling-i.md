---
id: m-3
title: "M3 eser as a Go binary; gate and release tooling in Go"
---

## Description

Ship cmd/eser in Go. It runs the manifest workflows and every validator, owns release and version tooling plus kit, cs and ai, and forwards laroux, noskills and posts to bins that exist. The eser binary channels come back, and installed v4.5.x eser, laroux and noskills binaries can update to something that works.

Exit criteria:
- `eser ok` (Go) runs the precommit workflow, and the git hooks and CI validate job use it; `make ok` passes
- Release, rerelease, unrelease, versions, changelog, release-notes, release-tag and gh contributors run in Go
- cli/scripts/compile.ts and the node updater scripts are deleted; Go builds the archives, the forwarding stubs, SHA256SUMS.txt and the Homebrew and Nix outputs
- Preflight proves that v4.5.2-named eser, laroux and noskills archives self-update to the Go eser binary or to the forwarding stubs
- `eser laroux --help`, `eser noskills --help`, `eser posts --help` and `npx eser@<packed> noskills --help` work from the packed packages
- install.sh, install.ps1, Homebrew, Nix and the npm launcher install eser
- The TypeScript eser dispatcher, codebase CLI layer, TS workflows engine and the kit and cs twins are deleted; the gate is green
