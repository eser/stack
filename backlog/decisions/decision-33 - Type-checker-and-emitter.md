---
id: decision-33
title: Type checker and emitter
date: '2026-10-15 20:38'
status: accepted
---

## Context

TypeScript 7.0.2 (the Go port) is GA and about 8 to 12 times faster, but ships no programmatic API until 7.1. oxlint type-aware mode uses the same engine. nodenext needs resolveJsonModule for the 31 JSON imports, and allowImportingTsExtensions requires noEmit or emitDeclarationOnly.

## Options

- tsc 7 for the check (noEmit, allowImportingTsExtensions, resolveJsonModule) and for emit (rewriteRelativeImportExtensions, no allowImportingTsExtensions)
- oxlint --type-check only
- Both

## Recommendation

tsc 7 --noEmit as the gate step and a separate tsconfig.build.json for emit. Pin @typescript/typescript6 only if a tool needs the API.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-195 (M1-T1), TASK-200 (M1-T6), TASK-232 (M2-T1)

Plan key: `type-checker`
