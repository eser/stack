---
id: TASK-28
title: Make the rate limiter's loopback bypass an explicit opt-in
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - security
  - ajan
  - httpfx
dependencies: []
references:
  - pkg/ajan/httpfx/middlewares/rate_limit_middleware.go
priority: medium
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/httpfx/middlewares/rate_limit_middleware.go:122-124 skips rate limiting whenever the key is 127.0.0.1, ::1 or localhost. Behind a reverse proxy without ResolveAddressMiddleware WithTrustedProxies, every request has RemoteAddr 127.0.0.1, so rate limiting (login routes included) is silently off. Rule: security-practices http-and-auth.md: Layered Controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No loopback bypass unless a WithRateLimiterSkipLoopback (or similar) option is set
- [x] #2 Existing local-dev callers that relied on it set the option explicitly
- [x] #3 Tests cover both modes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: Verified: the key-based loopback bypass is gone. WithRateLimiterSkipLoopback checks the socket peer through lib.SplitHostPort, netip and Unmap().IsLoopback(). There are no callers outside tests. TestRateLimitLoopbackBypass covers both modes, IPv4 and IPv6, and a forged key.
<!-- SECTION:NOTES:END -->
