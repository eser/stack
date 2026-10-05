---
id: TASK-171
title: Allow configured origins to open WebTransport sessions on httpfx HTTP3Service
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - httpfx
  - security
dependencies: []
priority: medium
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
webtransport-go v0.13 treats a nil webtransport.Server.CheckOrigin as same-origin: a CONNECT with an Origin header whose host differs from the request Host is refused with 'request origin not allowed'. noskills-web's static/mux-remote.js dials cfg.baseUrl (https://host:4433), so a browser page served from any other origin would be refused at Upgrade. I have not checked this in a browser. Fixing it means loosening a CSRF protection with an origin allowlist (for example an httpfx config value passed to CheckOrigin), which needs the owner to decide which origins are allowed. That makes it more than a mechanical fix for this run.

Decision: add an allowed-origins list to the httpfx HTTP3 config, passed to webtransport.Server.CheckOrigin. The default stays same-origin, and only exact origins are accepted (no wildcard). noskills-server exposes the setting in its config.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The allowed WebTransport origins come from config and default to same-origin
- [ ] #2 A test shows an allowed cross-origin CONNECT upgrades and a disallowed one is refused
- [ ] #3 deno task cli ok passes
<!-- AC:END -->
