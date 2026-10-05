---
id: TASK-145
title: Apply the httpfx Router path or drop the parameter
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - api
dependencies: []
references:
  - pkg/ajan/httpfx/router.go
priority: low
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NewRouter(path) (pkg/ajan/httpfx/router.go:36-60) stores path, but Route and RouteRaw register patterns verbatim (line 233), and Group (lines 94-114) panics because grouping never worked. A caller writing NewRouter("/api") and Route("GET /users") gets /users. Production callers pass "". Rule: architecture-guidelines: Public API and CLI Surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either the path is applied and Group works, with tests that register through a group and serve through the mux, or NewRouter takes no path and GetPath is removed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: NewRouter(logger *logfx.Logger), and GetPath and Group are removed. No caller in the root module passes a path; go build and go vet ./... pass. The connfx README still shows NewRouter("/api"); that file is outside this unit and already listed in crossUnitNeeds.
<!-- SECTION:NOTES:END -->
