---
id: TASK-140
title: Skip the empty body write for bodiless results in the httpfx router
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - bug
dependencies: []
references:
  - pkg/ajan/httpfx/router.go
priority: low
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Route.MuxHandlerFunc (pkg/ajan/httpfx/router.go:224-229) calls responseWriter.Write(result.Body()) after WriteHeader even when the body is empty. quic-go's HTTP/3 writer returns http.ErrBodyNotAllowed for a 204 even with an empty slice, so the noskills daemon logs 'Failed to write HTTP response body' on every 204, and the log goes through slog instead of logfx. Rule: go-practices: Logging Conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An empty body is not written
- [x] #2 Remaining write errors are logged through logfx
- [x] #3 A test shows no error for a 204
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: writeResult returns before Write when the body is empty, and logWriteError logs through the router's logfx logger with the request context.
<!-- SECTION:NOTES:END -->
