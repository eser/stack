---
id: TASK-24
title: Set Referrer-Policy and Permissions-Policy in SecurityHeadersMiddleware
status: Done
assignee: []
created_date: '2026-09-25 19:59'
updated_date: '2026-10-04 20:52'
labels:
  - security
  - ajan
  - httpfx
dependencies: []
references:
  - pkg/ajan/httpfx/middlewares/security_headers_middleware.go
  - .agents/skills/security-practices/references/http-and-auth.md
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
httpfx/middlewares/security_headers_middleware.go sets X-Content-Type-Options, X-Frame-Options and HSTS, but not Referrer-Policy or Permissions-Policy. Without Referrer-Policy, full URLs (which can carry ids or tokens in query strings) leak to third-party sites in the Referer header; without Permissions-Policy, embedded content can request camera, microphone or geolocation. Rule: security-practices http-and-auth.md: Security Headers. Add Referrer-Policy: strict-origin-when-cross-origin and a restrictive Permissions-Policy by default, with options to override. Also check that HSTS is sent only on HTTPS responses. Update the http-and-auth.md sentence that says these headers are missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Responses carry Referrer-Policy: strict-origin-when-cross-origin by default
- [x] #2 Responses carry a restrictive Permissions-Policy by default, overridable through an option
- [x] #3 HSTS is not sent on plain HTTP responses
- [x] #4 Tests cover the defaults and the overrides; http-and-auth.md is updated; deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: Verified in code and tests: the defaults, the overrides, empty values that omit a header, and HSTS on TLS only or from a trusted proxy with X-Forwarded-Proto https. A live run of the README example confirmed there is no HSTS over plain HTTP. The http-and-auth.md Security Headers rule is rewritten, which also covers TASK-65's http-and-auth.md item.
<!-- SECTION:NOTES:END -->
