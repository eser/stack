---
id: TASK-197
title: Apply the lint-pragma codemod repo-wide
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cutover
  - codemod
  - oxlint
milestone: m-1
dependencies:
  - TASK-196
  - TASK-193
priority: high
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run etc/codemods/lint-pragmas.ts over every tracked .ts and .js file in one mechanical commit, then run oxfmt. Wave A is sequential: this runs after M1-T2 and before M1-T4, and no wave B worktree branches before it lands.

Plan key: M1-T3. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -n 'deno-lint-ignore\|deno-fmt-ignore'` returns nothing
- [ ] #2 `pnpm exec oxlint --report-unused-disable-directives` reports no unknown rule names or unused directives
<!-- AC:END -->
