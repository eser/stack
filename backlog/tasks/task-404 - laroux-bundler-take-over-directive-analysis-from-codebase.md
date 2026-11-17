---
id: TASK-404
title: 'laroux-bundler: take over directive-analysis from codebase'
status: Done
assignee: []
created_date: '2026-11-17 07:54'
updated_date: '2026-11-17 08:38'
labels:
  - laroux
  - codebase
milestone: m-7
dependencies: []
priority: low
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/codebase/directive-analysis.ts finds the files that start with "use client" or "use server" and lists their exports. Its only importers are in laroux-bundler (system.ts, adapters/react/rsc-analyze.ts, domain/client-action-stub.ts and domain/server-action-transform.ts), and the codebase dependency of laroux-bundler exists only for it. Move it and its tests into laroux-bundler, drop @eserstack/codebase from laroux-bundler's dependencies if nothing else uses it, and keep @eserstack/codebase/directive-analysis as a deprecated module of named re-exports until 6.0.0, since 5.0.0 published it on npm.

It belongs to the current pipeline: laroux R1 replaces it with the directive transforms of TASK-294, and decision-58 deletes the old pipeline in 6.0.0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 directive-analysis and its tests live in laroux-bundler, and its four importers use the local module
- [x] #2 laroux-bundler no longer depends on @eserstack/codebase unless another import needs it, and pnpm ok passes
- [x] #3 @eserstack/codebase/directive-analysis stays as a deprecated copy until 6.0.0: a re-export from laroux-bundler would make codebase (layer 3) import a layer 4 package
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Copied directive-analysis.ts and its test to laroux-bundler/domain/; system.ts, rsc-analyze.ts, client-action-stub.ts and server-action-transform.ts import it locally. laroux-bundler no longer depends on @eserstack/codebase, so neither laroux package pulls codebase in. The codebase module stays as a deprecated copy (module doc and mod.ts comment), noted on TASK-317 for deletion in 6.0.0. Verified: pnpm ok; 27 laroux-bundler tests (directive-analysis and system); laroux-bundler builds its dist.
<!-- SECTION:NOTES:END -->
