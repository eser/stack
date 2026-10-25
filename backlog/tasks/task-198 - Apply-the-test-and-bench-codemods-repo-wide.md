---
id: TASK-198
title: Apply the test and bench codemods repo-wide
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cutover
  - codemod
  - tests
  - bench
milestone: m-1
dependencies:
  - TASK-197
  - TASK-192
  - TASK-193
priority: high
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After M1-T3, run etc/codemods/tests.ts and benches.ts over every package, etc/scripts and the recipes in one mechanical commit, then run oxfmt. Update each wave B task's notes with the files the codemod reported for hand edits. Every wave B task depends on this task, and through it on M1-T3.

Decisions this task waits on: decision-7 (Test runner and assertion library).

Plan key: M1-T4. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -n 'Deno\.test\|Deno\.bench\|t\.step(\|@std/testing/bdd'` returns nothing
- [ ] #2 The commit contains no other source change
- [ ] #3 Every wave B task lists its remaining hand-edit files
<!-- AC:END -->
