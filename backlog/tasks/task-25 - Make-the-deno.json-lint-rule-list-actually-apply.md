---
id: TASK-25
title: Make the deno.json lint rule list actually apply
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - tooling
  - lint
dependencies: []
references:
  - deno.json
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deno.json puts the extra rule list at lint.include, a sibling of lint.rules, where Deno reads it as file globs. So none of the 18 listed rules run (no-console, eqeqeq, no-top-level-await, verbatim-module-syntax, camelcase and the rest); only the recommended tag is active. Moving the list into lint.rules.include surfaces 9,393 diagnostics: prefer-ascii 8,291, no-await-in-loop 352, no-console 268, no-top-level-await 220, verbatim-module-syntax 75, camelcase 72, no-undef 41, no-external-import 24, ban-unused-ignore 22, default-param-last 21, eqeqeq 5, ban-untagged-todo 1, no-throw-literal 1. Decide per rule: keep and fix, keep with a baseline or exclude list, or drop (prefer-ascii conflicts with the emoji kept in READMEs and CLI output). Several skills cite these rules as lint-enforced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lint.rules.include holds the rule list and deno lint applies it
- [x] #2 A decision per rule is recorded in deno.json (kept, excluded paths, or removed)
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

lint.rules.include now holds the rule list, so deno lint applies it. prefer-ascii is removed: it flagged 8,291 emoji kept on purpose in READMEs and CLI output. Every other rule is kept, and the units fixed their findings or added an ignore with a reason (no-await-in-loop where a loop is sequential on purpose, no-top-level-await at entry points, file-level no-console in CLI output modules).
<!-- SECTION:NOTES:END -->
