---
id: TASK-184
title: 'collector: walk files with runtime.fs so laroux needs no native library'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 16:49'
labels:
  - collector
  - laroux
  - ts-fallback
milestone: m-0
dependencies: []
priority: high
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
collector.walkFiles (collector/collector.ts:30-40) throws when the bridge is missing. laroux-bundler calls it from route-scanner.ts:164, rsc-analyze.ts:165, rsc-rewrite-imports.ts:616, tailwindcss/plugin.ts:109 and build-validator.ts:180, :285. Keep the Go path: when the native library loads, walkFiles still delegates to collectorfx through the bridge (decision-22). Add a fallback on runtime.fs.walk, which maps to node:fs on Node, for when the bridge is missing, ESER_AJAN=disabled, or only the WASM build loads, which has no filesystem (decision-45). The fallback keeps the same include, exclude and ordering semantics. Remove the native-only requirement. TASK-267 keeps this walk as a TypeScript fallback.

Plan key: M0-T11. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 walkFiles returns the same results as the Go version on fixture trees (test)
- [x] #2 With the native library loaded, walkFiles calls the Go collector, and without it walkFiles uses runtime.fs.walk (test)
- [x] #3 `laroux build` of a fixture works with ESER_AJAN=disabled
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New collector/walk-fs.ts: the TypeScript twin of collectorfx.WalkCollectableFiles (same extensions, case-insensitive; same skipped directory names; unreadable entries below the root skipped; an unreadable root throws UnreadableWalkRootError; depth-first walk over name-sorted entries, which is filepath.WalkDir's order). It uses runtime.fs.readDir rather than runtime.fs.walk, because walk neither sorts nor skips unreadable directories, so it cannot keep the Go order and skip rules. walkFiles calls Go when the native library loads; with no library (missing, ESER_AJAN=disabled) or when the Go walk reports an error (the WASM build without a preopen, or a JS-only RegExp Go cannot compile), it uses the TypeScript walk. Tests (walk-fs.test.ts): fixed expected order, equality with the Go walk for four patterns, the root error, a stubbed Go symbol proves the Go path, a stubbed Go error proves the fallback, and a subprocess with ESER_AJAN=disabled. AC #3: laroux-bundler system.test.ts (11 build tests, including the minimal laroux app build) passes with ESER_AJAN=disabled; before this change walkFiles threw 'native library unavailable' there. README documents the rules and the fallback. Full gate: deno task cli ok passed on 2026-10-24.
<!-- SECTION:NOTES:END -->
