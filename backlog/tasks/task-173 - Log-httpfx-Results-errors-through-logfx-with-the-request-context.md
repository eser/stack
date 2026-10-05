---
id: TASK-173
title: Log httpfx Results errors through logfx with the request context
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - httpfx
  - logging
dependencies: []
priority: medium
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
httpfx results.go still logs through slog's default logger with no request context. WithSanitizedError logs 'request error', Results.JSON logs encoding failures, and Results.Abort logs at debug. So these entries carry no trace id and bypass the service's logfx logger (go-practices: Logging Conventions). WithSanitizedError is a package-level function called from about 55 handler sites, most of them in noskillsserverfx. Fixing it means changing its signature, or moving the logging to the callers or into a Results value that carries the logger and the request context, which is a public API decision. TASK-140 fixed only the router's write-error log.

Decision: Results carry the error, and the router logs it once through its logfx logger with the request context when it writes the result. WithSanitizedError keeps its signature and stops logging, so its callers need no change apart from tests; results.go has no slog calls left.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No slog.Error/Debug calls remain in httpfx results.go; errors are logged once through logfx with the request context
- [ ] #2 Every caller of WithSanitizedError is migrated, and a test checks that the trace id appears in the logged entry
- [ ] #3 deno task cli ok passes
<!-- AC:END -->
