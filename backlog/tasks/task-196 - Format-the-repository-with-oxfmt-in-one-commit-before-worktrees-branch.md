---
id: TASK-196
title: Format the repository with oxfmt in one commit before worktrees branch
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 15:00'
labels:
  - cutover
  - oxfmt
milestone: m-1
dependencies:
  - TASK-195
priority: high
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run oxfmt over the whole tree as a single commit that changes formatting only, and add its SHA to .git-blame-ignore-revs. It lands before any wave B worktree branches, so every agent starts from the formatted tree.

Decisions this task waits on: decision-19 (oxfmt settings and the one-time reformat).

Plan key: M1-T2. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm exec oxfmt --check` is clean
- [x] #2 The commit changes formatting only; test file and Deno.test counts are unchanged
- [x] #3 .git-blame-ignore-revs lists the commit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25. Commit 09ab6f7b (`style(*): format the repository with oxfmt`) ran oxfmt 0.73.0 over the tree with .oxfmtrc.json from TASK-195: 800 files changed. `pnpm exec oxfmt --check` is clean (1,723 files).
- `**/testdata/` was added to the oxfmt ignore patterns: the Go fixtures under pkg/ajan are recorded data, and oxfmt lays JSON out differently from deno fmt. The 78 fixtures it had changed were put back as they were.
- One code fence changed meaning: in .agents/skills/frontend-practices/references/laroux.md, the misplaced `"use client";` example became `("use client");`. The fence now has `<!-- prettier-ignore -->` and keeps the original text.
- One file (laroux-bundler/adapters/react/rsc-rewrite-imports.ts) needed a second oxfmt pass to settle.
- Formatting only: 441 test files, 2,481 `Deno.test` and 2,503 `it(` calls before and after. On the formatted tree, `deno test -A --no-check` passes 3,627 tests with 0 failures and `make ok` passes, after `make ajan-lib ajan-wasm-check` built the native library in the worktree.
- .git-blame-ignore-revs lists the commit.
<!-- SECTION:NOTES:END -->
