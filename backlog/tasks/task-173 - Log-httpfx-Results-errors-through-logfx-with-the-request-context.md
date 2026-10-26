---
id: TASK-173
title: Log httpfx Results errors through logfx with the request context
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
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
- [x] #1 No slog.Error/Debug calls remain in httpfx results.go; errors are logged once through logfx with the request context
- [x] #2 Every caller of WithSanitizedError is migrated, and a test checks that the trace id appears in the logged entry
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified: /Users/eser/projects/eser/stack/pkg/ajan/httpfx/results.go no longer imports log/slog. WithSanitizedError keeps its signature and only sets InnerError and the sanitized body. JSON and WithJSON carry the encoding error, which names only the Go type. Abort logs nothing. Router.logResultError in router.go logs through the router's logfx logger with ctx.Request.Context(), which carries the trace id. It runs once per request, in Route and on every RouteRaw path, including the recovered-panic abort. No WithSanitizedError caller writes Results outside the router: a grep finds no .Body() or StatusCode() use in noskillsserverfx, api or cmd. No default-slog call (slog.Error, Warn, Info or Debug) remains in the unit's non-test code. Trace-id tests: TestRouter_LogsResultErrors, TestErrorHandlerMiddlewareLogsThePanicWithTheTraceID and TestServer_HandlerErrorsReachTheServerLogger. The README documents the change and the migration.
<!-- SECTION:NOTES:END -->
