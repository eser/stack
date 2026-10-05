---
id: TASK-92
title: Serialize Error attributes in @eserstack/logging
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
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
- [ ] #1 Error values in attributes serialize as name, message, stack and the cause chain on both the Go and the fallback path
- [ ] #2 A logger test checks an Error attribute with a cause
- [ ] #3 laroux-bundler's describeError is removed or reduced to a call into the logger
- [ ] #4 deno task cli ok passes
<!-- AC:END -->
