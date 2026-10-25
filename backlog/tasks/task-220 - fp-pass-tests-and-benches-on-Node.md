---
id: TASK-220
title: 'fp: pass tests and benches on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - fp
  - bench
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the hand-edit tests in pkg/@eserstack/fp (165 tests), and confirm that the 11 bench files converted to mitata run with `pnpm bench`. Remove their entries from the code-conventions baseline.

Decisions this task waits on: decision-36 (Replacement for Deno.bench).

Plan key: M1-T26. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test pkg/@eserstack/fp` passes, and the benches run
- [ ] #2 The code-conventions baseline only shrinks; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 50 files, 50 pass, 165 tests, 0 fail. Nothing to hand-edit.
- Benches: 11 files with 29 Deno.bench calls, placeholders now. For the mitata port, no package.json has a mitata dependency and fp/package.json has no bench script.
- Code-conventions baseline entries to drop once the benches move: chunk, get, group-by, key-by, memoize (.bench.ts).
- Source: 0 Deno, Bun or specifier uses. Docs: none.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.
<!-- SECTION:NOTES:END -->
