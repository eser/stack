---
id: TASK-110
title: Make the standards JSDoc examples compile as pasted
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - standards
  - docs
dependencies: []
references:
  - pkg/@eserstack/standards/collections/mod.ts
  - pkg/@eserstack/standards/cross-runtime/mod.ts
  - pkg/@eserstack/standards/i18n/mod.ts
priority: low
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno check --doc` on the standards sub-module entry points fails with 10 errors from undeclared placeholders: Item, itemAInstance, createItemB, newInstance, ItemA, ItemB and Format in collections/mod.ts, mockFs in cross-runtime/mod.ts and userLocale in i18n/mod.ts. Rule: documentation-conventions: Code Examples.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each example declares its placeholders
- [x] #2 deno check --doc on collections/mod.ts, cross-runtime/mod.ts and i18n/mod.ts passes
- [x] #3 Adding the doc check to the gate is considered and the outcome recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Re-ran:
- `deno check --doc` on every non-test, non-bench standards module outside routes/: clean.
- `deno check --doc-only README.md`: clean.
- `deno doc --lint` on all 18 non-routes package.json export entries: clean.

The gate decision (a manifest change outside these paths) is recorded in stage 1 crossUnitNeeds.
<!-- SECTION:NOTES:END -->
