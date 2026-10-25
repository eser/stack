---
id: TASK-198
title: Apply the test and bench codemods repo-wide
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
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
- [x] #1 `git grep -n 'Deno\.test\|Deno\.bench\|t\.step(\|@std/testing/bdd'` returns nothing
- [x] #2 The commit contains no other source change
- [x] #3 Every wave B task lists its remaining hand-edit files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25. Ran `node etc/codemods/tests.ts` and `node etc/codemods/benches.ts` over the tracked sources (packages, etc/scripts and the recipes), then oxfmt; `oxfmt --check` is clean.
- tests.ts: 444 files read, 437 changed; 2,457 Deno.test calls, 94 t.step calls, 114 sanitizer keys removed, 50 ignore options turned into skip, 140 bdd files (11 object-form calls made positional). 0 unhandled sites.
- benches.ts: 15 files, 154 benches in 66 groups with 66 baselines. 0 unhandled sites.
- AC #1: `git grep -n 'Deno\.test\|Deno\.bench\|t\.step(\|@std/testing/bdd'` now matches no test or bench code. What is left: the codemods and their tests (etc/codemods/, deleted in TASK-231), backlog records, Go code in cmd/noskills whose `t.step` is a different type, string data in validate-code-conventions.test.ts and noskillsfx testdata, a commented-out block in the jsx-runtime-app recipe (deleted in TASK-210), and prose in the skills and repo docs (.agents/skills testing references, docs/agents/*.md, config/WIRING.md, security-report.md), which TASK-228 and TASK-230 rewrite.
- AC #2: the commit holds the codemod output, its oxfmt pass and the backlog notes; no other source change.
- AC #3: every wave B task (TASK-201 to TASK-227) has a TASK-198 note with its files. The codemods left no hand-edit site, so each note lists the test files that still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone, with the first error. The tally is 435 test files, 386 passing and 49 failing (the TASK-175 spike measured 381 and 39 after its throwaway codemod): standards 6, ajan 4, bundler 1, laroux-bundler 5, laroux-server 3, noskills 13, noskills-web 3 plus the dashboard's browser_scripts.test.ts under pkg/ajan, posts 5, shell 1, httpclient 1, config 2, collector 1, events 1, http 1, testing 1.
<!-- SECTION:NOTES:END -->
