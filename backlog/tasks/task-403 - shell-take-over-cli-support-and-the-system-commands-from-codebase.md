---
id: TASK-403
title: 'shell: take over cli-support and the system commands from codebase'
status: Done
assignee: []
created_date: '2026-11-17 07:54'
updated_date: '2026-11-17 08:24'
labels:
  - shell
  - codebase
  - cli
milestone: m-3
dependencies: []
priority: medium
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/codebase/cli-support.ts is the entry point of every TypeScript bin: the CLI context and output, runCliMain, exitCli, runStandaloneModule and attachStandardCommands, which mounts the system, install, update, version and doctor commands from pkg/@eserstack/codebase/cli-system/. Its importers are the bins of cli, noskills and laroux-server (bin.ts, main.ts, bin-main.ts) and codebase's own TS commands. Nothing in it is about a codebase: it is CLI infrastructure, which @eserstack/shell (layer 2) owns. Its dependencies are shell, primitives, streams, standards and a type from @eserstack/functions (layer 1), so the move adds no upward edge.

Move cli-support.ts and cli-system/ with their tests into @eserstack/shell (for example @eserstack/shell/cli-support and @eserstack/shell/cli-system), point every importer at the new paths, and keep @eserstack/codebase/cli-support as a deprecated module of named re-exports until 6.0.0, since 5.0.0 published it on npm.

TASK-255 listed codebase/cli-system for deletion; laroux keeps a TypeScript bin with `laroux system update` and the rest, so cli-system moves instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cli-support and cli-system live in @eserstack/shell with their tests, and the cli, noskills, laroux-server and codebase sources import them from there
- [x] #2 @eserstack/codebase/cli-support still resolves, re-exports the shell module by name and is marked deprecated until 6.0.0
- [x] #3 laroux, noskills and eser keep their system, install, update, version and doctor commands, shown by a test per bin or an existing preflight step
- [x] #4 validate-circular-deps and the layer rules pass, and pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved cli-support.ts, its two tests and cli-system/ to pkg/@eserstack/shell; self-imports became relative paths. shell gains the ./cli-support export and a dependency on @eserstack/functions (layer 1, the CliEvent type). codebase's 39 importers, the cli, noskills and laroux-server bins and the legacy updater fixture point at the new paths. laroux-server no longer depends on @eserstack/codebase: cli-support was its only import. Verified: pnpm ok; the 24 moved tests pass; `version` and `system --help` (7 subcommands) run on the laroux-server, noskills and cli bins; shell and codebase build their dist.
<!-- SECTION:NOTES:END -->
