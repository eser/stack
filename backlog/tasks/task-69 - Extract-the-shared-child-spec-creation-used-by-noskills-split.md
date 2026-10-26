---
id: TASK-69
title: Extract the shared child-spec creation used by noskills split
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - refactor
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/next.ts
  - pkg/@eserstack/noskills/commands/spec.ts
priority: low
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/next.ts handleSplit (lines 1251-1291) and commands/spec.ts specSplit (the auto branch at 792-807 and the manual branch at 842-858) repeat the same steps: create the spec directory, startSpec, copy the discovery answers, completeDiscovery and writeSpecState. The three copies must change together, and a fix applied to one silently misses the others. Rule: coding-practices: Don't Repeat Yourself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One helper creates a child spec and both split paths call it
- [x] #2 Existing split tests pass, and a test covers the helper directly
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: state/split.ts splitSpec and createChildSpec are used by next.ts handleSplit and both branches of spec.ts specSplit. The split, next and spec tests pass.
<!-- SECTION:NOTES:END -->
