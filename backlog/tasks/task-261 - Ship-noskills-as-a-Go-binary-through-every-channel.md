---
id: TASK-261
title: Ship noskills as a Go binary through every channel
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 23:23'
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
- [ ] #2 A preflight test self-updates from a v4.5.2-named noskills archive to the Go binary
- [ ] #3 `npx noskills --version` and `npx <packed eser> noskills --version` from the packed launchers run the Go binary
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-257: cmd/noskills forwards non-ported commands to 'npx --yes noskills@<version>' as its last fallback. When this task makes the npm noskills package the Go launcher, that fallback resolves to the binary itself; change the lookup (for example to the TS CLI package) so it cannot loop.
<!-- SECTION:NOTES:END -->
