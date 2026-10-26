---
id: TASK-139
title: Stop leaking a rate limiter and cleanup goroutine per RateLimitMiddleware call
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - bug
dependencies: []
references:
  - pkg/ajan/httpfx/middlewares/rate_limit_middleware.go
priority: medium
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
RateLimitMiddleware stores each limiter in the package-global globalRateLimiters map (pkg/ajan/httpfx/middlewares/rate_limit_middleware.go:17) under a key that includes the config pointer (line 206), so limiters are never shared and never removed. Each limiter's cleanup goroutine loops on a ticker forever (lines 111-114). Every call, in tests or router rebuilds, leaks a map entry and a goroutine. TASK-28 edits the same file. Rules: coding-practices: Bound Every Resource, Owned Asynchronous Work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No package-level limiter map remains
- [x] #2 The cleanup goroutine stops on a context or Close
- [x] #3 A test shows no goroutine growth across repeated construction
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: no package-level limiter map, and no goroutine. Each limiter is owned by its handler, and requests sweep expired entries. The repeated-construction goroutine test passes with -race.
<!-- SECTION:NOTES:END -->
