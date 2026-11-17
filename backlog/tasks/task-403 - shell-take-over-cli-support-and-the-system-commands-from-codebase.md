---
id: TASK-403
title: 'shell: take over cli-support and the system commands from codebase'
status: To Do
assignee: []
created_date: '2026-11-17 07:54'
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
- [ ] #1 cli-support and cli-system live in @eserstack/shell with their tests, and the cli, noskills, laroux-server and codebase sources import them from there
- [ ] #2 @eserstack/codebase/cli-support still resolves, re-exports the shell module by name and is marked deprecated until 6.0.0
- [ ] #3 laroux, noskills and eser keep their system, install, update, version and doctor commands, shown by a test per bin or an existing preflight step
- [ ] #4 validate-circular-deps and the layer rules pass, and pnpm ok passes
<!-- AC:END -->
