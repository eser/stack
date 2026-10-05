---
id: TASK-131
title: Reconcile the primitives README philosophy with its combinators
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - primitives
  - docs
dependencies: []
references:
  - pkg/@eserstack/primitives/README.md
  - pkg/@eserstack/primitives/results.ts
  - pkg/@eserstack/primitives/options.ts
priority: low
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The primitives README says 'No transformations, no combinators' (README.md:24) and points to @eserstack/fp for map, flatMap and match, yet results.ts and options.ts export map, flatMap, match, getOrElse, all, any, tap, zip and more. The owner decides whether to move them to fp or rewrite the Design Philosophy section. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The README and the exports agree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked: every export of results.ts and options.ts appears in the README Exports table (a grep found none missing), and the 'no combinators' claim is gone. While checking this package I fixed the type-guards.ts JSDoc example, which used undeclared variables `value` and `data` and failed deno check --doc.
<!-- SECTION:NOTES:END -->
