---
id: TASK-126
title: Make the logging README examples type-check
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - logging
  - docs
dependencies: []
references:
  - pkg/@eserstack/logging/README.md
priority: low
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno check --doc-only pkg/@eserstack/logging/README.md` reports 14 errors. Some come from undefined placeholders (processRequest, processOrder, orderId, fileStream, computeExpensiveDebugInfo, mySpanFormatter), others from API-reference fragments that use Sink, Filter, LoggerConfig, ContextLocalStorage and `logging` without importing them. Rule: documentation-conventions: Code Examples.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Placeholders are defined and types are imported through the package namespace
- [x] #2 deno check --doc-only on the README passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: `deno check --doc-only pkg/@eserstack/logging/README.md` passes, still passing after my serialize.ts change. The placeholders are defined, and types come through the logging namespace. The new 'Logging Errors' section matches the code: args are sent as attrs.args and go through the same replacer.
<!-- SECTION:NOTES:END -->
