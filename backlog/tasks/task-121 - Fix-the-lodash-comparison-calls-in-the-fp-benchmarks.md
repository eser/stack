---
id: TASK-121
title: Fix the lodash comparison calls in the fp benchmarks
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - fp
  - test
dependencies: []
references:
  - pkg/@eserstack/fp/chunk.bench.ts
  - pkg/@eserstack/fp/wthout.bench.ts
priority: low
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno check pkg/@eserstack/fp` fails on two bench errors. lodash.chunk ships no types, so `lodashChunk(arr, 3)` (chunk.bench.ts:19) is TS2554 against the inferred required guard parameter. wthout.bench.ts:29 calls `lodashReject(student, "name", "age")`, but reject takes (collection, predicate), so the benchmark does not compare like with like.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both benchmarks compare equivalent operations
- [x] #2 deno check pkg/@eserstack/fp passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: chunk.bench.ts casts lodash.chunk to its documented (array, size) signature. wthout.bench.ts compares against rest destructuring and Object.fromEntries/filter. deno check pkg/@eserstack/fp passes, and `deno bench` runs both files. The lodash.reject devDependency is gone from fp/package.json; pnpm-lock.yaml still needs refreshing (crossUnitNeeds).
<!-- SECTION:NOTES:END -->
