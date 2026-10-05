---
id: TASK-29
title: Accept the PIN token from the query string only on WebTransport requests
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
  - pkg/ajan/httpfx/middlewares/pin_auth_middleware.go
priority: medium
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/httpfx/middlewares/pin_auth_middleware.go:56-63 extractPinToken falls back to ?token= for every request, although the reason given is WebTransport CONNECT, which cannot set headers. Tokens in URLs reach access logs, browser history and Referer headers. Rule: security-practices http-and-auth.md: Tokens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The query fallback applies only to the WebTransport path; other requests need the Authorization header
- [x] #2 The noskills web client and WebTransport client still authenticate
- [x] #3 Tests cover both paths
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: Verified: the query fallback applies only when ctx.IsRaw holds, the method is CONNECT and Proto is webtransport-h3 or webtransport. Those are the values quic-go http3 places in Request.Proto and webtransport-go's Upgrade accepts. TS clients use ?token= only on the /attach WebTransport path (noskills-client attach.ts). noskills-web's client.js /mux?token= goes to its own TS server. I checked this by reading the code, not end to end.
<!-- SECTION:NOTES:END -->
