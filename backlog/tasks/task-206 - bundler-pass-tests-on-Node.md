---
id: TASK-206
title: 'bundler: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - bundler
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the hand-edit tests listed in the notes for pkg/@eserstack/bundler (251 tests), and remove the Deno sections from the README: the Deno.bundle backend and the comparison table.

Plan key: M1-T12. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test 'pkg/@eserstack/bundler/**/*.test.ts'` passes
- [ ] #2 tsc and oxlint are clean for the package; `git grep -wn Deno pkg/@eserstack/bundler` returns nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 9 files, 8 pass, 1 fail; 215 tests pass, 3 fail.
- Deno API through a dependency: css/modules.ts:14 imports @std/fs, whose stable API calls Deno.* internally, so fs.expandGlob (:205) throws "Deno is not defined" (3 findCssModules tests in css/modules.test.ts). @std/fs is also used at :57, :163, :170, :177 and :188 (readTextFile, ensureDir, writeTextFile): move them to runtime.fs or node:fs.
- Tests: no Deno API left; 0 sanitizer options.
- Docs: pkg/@eserstack/bundler/README.md (2: the Deno.bundle backend and the comparison table).
<!-- SECTION:NOTES:END -->
