---
id: TASK-118
title: Log noskills-web server errors through @eserstack/logging
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-web
  - logging
dependencies: []
references:
  - pkg/@eserstack/noskills-web/routes/api.ts
  - pkg/@eserstack/noskills-web/package.json
  - pkg/@eserstack/noskills/commands/web.ts
priority: low
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
routes/api.ts:55 jsonError writes caught faults to stderr with console.error under a no-console ignore. Moving to a structured logger needs @eserstack/logging in noskills-web's package.json, a pnpm-lock.yaml update, and `noskills web` (pkg/@eserstack/noskills/commands/web.ts) configuring a sink, or the detail is dropped. Rule: coding-practices: Structured Logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Server errors are logged through @eserstack/logging with request context
- [x] #2 noskills web configures a sink so the detail reaches the terminal
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Verified by running testdata/log-probe.ts:
- With no logging configuration, the default `noskills-web` logger writes one JSON record to stderr. It carries requestId, method, path without the query, spec, action and the full error (name, message, stack and cause).
- The response carries the same requestId and no detail.

I strengthened server-log.test.ts so it also checks that the error detail (`SpecNotFoundError`) is in the record. AC #2 is met by the default path that `noskills web` takes (startServer with no logger), not by a sink configured in noskills/commands/web.ts.
<!-- SECTION:NOTES:END -->
