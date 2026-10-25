---
id: TASK-232
title: Emit JS and declarations for every published library
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - npm
  - build
  - release
  - tsc
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tsconfig.build.json: tsc 7 emit to dist/ with rewriteRelativeImportExtensions and declaration, or the fallback emitter recorded in M0-T2. It sets noEmit false and drops allowImportingTsExtensions, which requires noEmit or emitDeclarationOnly; rewriteRelativeImportExtensions accepts the .ts specifiers on emit. Add a generator that writes each library's build script, `files` list and publishConfig.exports with types and import conditions, and apply it, one commit per package group. laroux-react keeps a source export for client/bootstrap, because laroux-bundler copies those sources. Add `pnpm -r build` and `pnpm -r pack` to preflight. Inside the workspace, sources still run directly. The full consumer install check waits for M2-T5, because the tarballs still carry @jsr aliases until M2-T2 and M2-T3.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-14 (Minimum Node.js version); decision-33 (Type checker and emitter).

Plan key: M2-T1. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `pnpm -r build` emits dist/ for all libraries with no .ts specifiers in the .js output
- [ ] #2 The packed tarball of primitives, which has no workspace dependencies, imports from a scratch consumer's node_modules on Node 26 without type stripping
- [ ] #3 The gate stays green
<!-- AC:END -->
