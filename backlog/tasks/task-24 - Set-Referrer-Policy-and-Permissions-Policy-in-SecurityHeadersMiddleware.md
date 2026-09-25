---
id: TASK-24
title: Set Referrer-Policy and Permissions-Policy in SecurityHeadersMiddleware
status: To Do
assignee: []
created_date: '2026-09-25 19:59'
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
- [ ] #1 Responses carry Referrer-Policy: strict-origin-when-cross-origin by default
- [ ] #2 Responses carry a restrictive Permissions-Policy by default, overridable through an option
- [ ] #3 HSTS is not sent on plain HTTP responses
- [ ] #4 Tests cover the defaults and the overrides; http-and-auth.md is updated; deno task cli ok passes
<!-- AC:END -->
