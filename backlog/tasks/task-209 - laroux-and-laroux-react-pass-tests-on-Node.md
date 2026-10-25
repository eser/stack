---
id: TASK-209
title: 'laroux and laroux-react: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - laroux
  - laroux-react
  - frontend
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the remaining hand-edit tests in pkg/@eserstack/laroux (55 tests) and pkg/@eserstack/laroux-react (64 tests), one commit per package. Remove the Deno wording in comments and READMEs, for example the 'RSC Renderer for Deno' header.

Keep it mechanical: track L replaces laroux-react's protocol.ts and client.ts (TASK-307, TASK-317). Tests for files that track L deletes (doc-3 section 27) get the tag `track-l-delete` in their test name, so TASK-317 can find them.

Plan key: M1-T15. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test` passes for both packages
- [ ] #2 No Deno reference remains; tsc and oxlint are clean for both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: laroux 9 of 9 files pass (156 tests); laroux-react 8 of 8 pass (109 tests).
- Source: Deno., Bun., jsr: and npm: are 0 in both; neither has a .tsx file.
- Docs: pkg/@eserstack/laroux-react/README.md (3, including the "RSC Renderer for Deno" header); deno.extra.json in laroux and laroux-react (1 each; TASK-224).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.
<!-- SECTION:NOTES:END -->
