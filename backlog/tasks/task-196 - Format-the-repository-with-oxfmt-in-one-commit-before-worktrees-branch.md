---
id: TASK-196
title: Format the repository with oxfmt in one commit before worktrees branch
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
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
- [ ] #1 `pnpm exec oxfmt --check` is clean
- [ ] #2 The commit changes formatting only; test file and Deno.test counts are unchanged
- [ ] #3 .git-blame-ignore-revs lists the commit
<!-- AC:END -->
