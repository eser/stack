---
id: TASK-92
title: Serialize Error attributes in @eserstack/logging
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - logging
  - bug
dependencies: []
references:
  - pkg/@eserstack/logging/logger.ts
  - pkg/@eserstack/laroux-bundler/domain/errors.ts
priority: medium
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Logger attributes go through JSON.stringify (pkg/@eserstack/logging/logger.ts:37-43 and the Go request at :218), so `logger.warn(msg, { error })` emits {"error":{}} and loses the message, stack and cause. Many handled sites log this way, for example laroux-bundler's build validator, virtual source and server-action transform, and laroux-bundler carries its own domain/errors.ts describeError as a workaround. Rule: coding-practices: Structured Logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Error values in attributes serialize as name, message, stack and the cause chain on both the Go and the fallback path
- [x] #2 A logger test checks an Error attribute with a cause
- [x] #3 laroux-bundler's describeError is removed or reduced to a call into the logger
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

The laroux part is complete and verified. laroux-bundler domain/errors.ts and errors.test.ts are deleted, and no reference to describeError or domain/errors is left in the laroux packages. Every former call site and the related error logs in laroux-bundler and laroux-server use `<logger>.with({ error }).<level>(text)`. init.ts prints cloneRecipe's message alone in red. AC #1 and #2 belong to the logging unit; AC #4 is checked by the orchestrator.

AC #1 and #2 (Error attributes serialize with name, message, stack and cause, with a test) were done in the small-a unit on 2026-10-05; AC #3 finished in round 3.
<!-- SECTION:NOTES:END -->
