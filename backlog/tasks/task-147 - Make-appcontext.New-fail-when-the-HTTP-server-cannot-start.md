---
id: TASK-147
title: Make appcontext.New fail when the HTTP server cannot start
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - api
  - bug
dependencies: []
references:
  - pkg/ajan/api/adapters/appcontext/appcontext.go
priority: medium
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
appcontext.New (pkg/ajan/api/adapters/appcontext/appcontext.go:69-70) starts httpService.Start inside a processfx goroutine and returns success at once. A listen failure (port in use, bad address) is only logged by processfx, and the composition root reports a healthy start. Rule: go-practices: Dependency Injection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New, or a Start step the caller runs, returns the listen error
- [x] #2 A test with an occupied port sees it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: appcontext.New calls httpService.Start(process.Ctx) directly. On failure it cancels and waits for the process, then returns the wrapped listen error. HighPerfListener.Close ends an Accept that is waiting for a connection slot.
<!-- SECTION:NOTES:END -->
