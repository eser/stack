---
id: TASK-176
title: 'fp: replace angle-bracket type assertions with as casts'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 16:36'
labels:
  - fp
  - erasable-syntax
milestone: m-0
dependencies: []
priority: high
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite the 50 `<T>x` assertions in 23 files of pkg/@eserstack/fp as `x as T`. 7 of these are source files (ensure-array.ts:23, associate-array.ts:29, map-array.ts:15 and others) and 16 are tests. Node type stripping rejects them, and codebase ./validation breaks under Node because it imports fp.

Plan key: M0-T3. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No angle-bracket type assertion remains in pkg/@eserstack/fp
- [x] #2 Every fp export, plus codebase ./validation and ./validate-package-configs, imports under plain `node` 26 when run from inside pkg/@eserstack/codebase
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote all 50 assertions (7 source, 16 test files) with a TypeScript-AST codemod. Every fp export and codebase ./validation and ./validate-package-configs import under plain node 26.5.1 from inside pkg/@eserstack/codebase. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
