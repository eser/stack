---
id: TASK-23
title: 'Require expiry, issuer and audience in the httpfx JWT auth middleware'
status: To Do
assignee: []
created_date: '2026-09-25 19:59'
labels:
  - security
  - ajan
  - httpfx
dependencies: []
references:
  - pkg/ajan/httpfx/middlewares/auth_middleware.go
  - .agents/skills/security-practices/references/http-and-auth.md
priority: high
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
httpfx/middlewares/auth_middleware.go parses bearer tokens with jwt.Parse and jwt.MapClaims. It checks the signing method in the key function, but a token without an exp claim is accepted (the expiry check runs only when exp is present), and issuer and audience are never checked. A leaked token without exp stays valid forever, and a token minted for another service with the same secret is accepted. Rule: security-practices http-and-auth.md: Tokens. Fix by passing jwt.WithValidMethods, jwt.WithExpirationRequired, jwt.WithIssuer and jwt.WithAudience, with issuer and audience from config; decide how existing deployments without these claims migrate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A token without exp is rejected with 401
- [ ] #2 A token with the wrong issuer or audience is rejected with 401
- [ ] #3 The signing algorithm is pinned through jwt.WithValidMethods
- [ ] #4 Issuer and audience come from httpfx config, and the change is documented for existing deployments
- [ ] #5 Tests cover each rejection case; deno task cli ok passes
<!-- AC:END -->
