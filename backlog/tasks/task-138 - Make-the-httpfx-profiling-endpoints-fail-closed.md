---
id: TASK-138
title: Make the httpfx profiling endpoints fail closed
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - security
dependencies: []
references:
  - pkg/ajan/httpfx/modules/profiling/profiling.go
priority: high
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
RegisterHTTPRoutes in pkg/ajan/httpfx/modules/profiling/profiling.go:18-28 mounts /debug/pprof/* unprotected when PPROF_TOKEN is unset and only logs a warning through slog. When set, the token is read from the ?token= query string, where it reaches access logs, and compared with != instead of a constant-time compare. The library also reads os.Getenv itself instead of taking the value from config. Rules: security-practices: Redirects and Debug Endpoints, Tokens, Passwords and PINs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Without a configured token the routes are not mounted or answer 403
- [x] #2 The token comes from config and the Authorization header and is compared in constant time
- [x] #3 Tests cover each case
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified profiling.go: it reads Config.ProfilingToken, accepts only an Authorization Bearer token, and compares SHA-256 digests with subtle.ConstantTimeCompare. With profiling on and no token, it returns ErrProfilingTokenNotSet and mounts nothing. A missing or wrong token gets 403. No query-string token is read.
<!-- SECTION:NOTES:END -->
