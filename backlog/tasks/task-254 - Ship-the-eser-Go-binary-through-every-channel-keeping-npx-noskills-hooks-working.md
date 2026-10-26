---
id: TASK-254
title: >-
  Ship the eser Go binary through every channel, keeping npx noskills hooks
  working
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go
  - distribution
  - release
  - npm
milestone: m-3
dependencies:
  - TASK-248
  - TASK-249
  - TASK-250
  - TASK-251
  - TASK-252
  - TASK-253
priority: high
ordinal: 254000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decisions binaries and npx-noskills-hooks:
- Restore the eser Homebrew formula, install.sh and install.ps1.
- Turn the npm `eser` package into a launcher whose per-platform optionalDependencies carry the Go binary.
- Until M4-T6, the launcher also declares the Node `noskills` package as a dependency and passes its bin directory to the Go binary through ESER_PLUGIN_PATH. Hooks that v4.5.x already wrote into users' repos (`npx eser@latest noskills ...`) therefore keep working with no PATH setup.
- Preflight serves a v4.5.2-named eser archive locally and proves self-update to the new binary.
- List the new npm platform package names for the owner's bootstrap.

Decisions this task waits on: decision-8 (What replaces deno compile for the eser, noskills and laroux binaries); decision-9 (What installed v4.5.x laroux and noskills binaries update to); decision-10 (How existing `npx eser@latest noskills` hooks keep working); decision-13 (When the first release after the cutover happens); decision-28 (posts in Go or as a Node plugin).

Plan key: M3-T11. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dry runs of install.sh, install.ps1, Homebrew, Nix and the packed npm launcher install a working eser
- [ ] #2 `npx <packed eser launcher> noskills --version` and a recorded v4.5.x hook command run the Node noskills through the launcher in a scratch project with no global installs
- [ ] #3 `eser posts --help` and `eser laroux --help` work from the packed packages
- [ ] #4 The preflight self-update test from a v4.5.2-named archive passes
- [ ] #5 The launcher fails with a clear message on an unsupported platform
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From TASK-261 (2026-10-25): the npm noskills package is already the launcher of the Go noskills, with @eserstack/noskills-<platform> optional dependencies. So the eser launcher can skip the Node noskills dependency step and depend on `noskills` at the exact version, pointing ESER_PLUGIN_PATH at its bin directory; cmd/eser already resolves `noskills` there. TASK-261 AC #3 (`npx <packed eser> noskills --version`) waits on this launcher.
<!-- SECTION:NOTES:END -->
