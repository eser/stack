---
id: TASK-137
title: Stop httpfx raw routes from running their handler after a middleware rejects
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - security
dependencies: []
references:
  - pkg/ajan/httpfx/router.go
priority: high
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Router.RouteRaw (pkg/ajan/httpfx/router.go:260-300) runs the middleware chain, ignores the returned Result unless a middleware called ctx.WriteEarly, and then always calls the raw handler. A middleware that rejects by returning a Result without calling Next (AuthMiddleware 401, RateLimitMiddleware 429, CorsMiddleware's OPTIONS 204, ErrorHandlerMiddleware's recovered panic) is ignored on WebTransport and other raw routes; a probe with AuthMiddleware and a token-less CONNECT reached the raw handler. Only PinAuthMiddleware protects raw routes today, because it uses WriteEarly. Rule: security-practices: Layered Controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A rejection Result from any middleware stops the raw handler and is written as MuxHandlerFunc writes it
- [x] #2 Tests cover AuthMiddleware and RateLimitMiddleware on a raw route
- [x] #3 noskills /attach still works
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: rawHandlerStep makes the raw handler the last step of the chain. A rejection Result is written through the same writeResult as Route. If a middleware recovers a raw-handler panic, the response is aborted with http.ErrAbortHandler. PinAuthMiddleware now returns its rejection as a Result. HTTP3Service serves through webtransport.Server. I added one fix: cleanup now also closes the UDP socket when the shutdown timeout fires; before, that path leaked the socket.
<!-- SECTION:NOTES:END -->
