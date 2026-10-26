---
id: TASK-171
title: Allow configured origins to open WebTransport sessions on httpfx HTTP3Service
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
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
- [x] #1 The allowed WebTransport origins come from config and default to same-origin
- [x] #2 A test shows an allowed cross-origin CONNECT upgrades and a disallowed one is refused
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified in /Users/eser/projects/eser/stack/pkg/ajan/httpfx/http3_origin.go, http3_service.go and config.go. H3AllowedOrigins (conf h3_allowed_origins) feeds webtransport.Server.CheckOrigin and WebTransportUpgrader.Upgrade. The default is same-origin: a request without Origin passes, and so does one whose Origin host equals the request Host. Entries are exact and normalized; wildcards, paths and non-http(s) schemes are rejected, and Start returns ErrHTTP3InvalidAllowedOrigin before it opens the socket. noskills-server: ServerConfig.AllowedOrigins and --allowed-origins (splitList), documented in the usage text and the README. wt_attach.go answers 403 on ErrWebTransportOriginNotAllowed. TestHTTP3Service_WebTransportAllowedOrigins dials real HTTP/3: a listed cross-origin page upgrades, a same-origin page upgrades, an unlisted one gets 403. TestAttachChecksTheOrigin covers the daemon. Both stayed stable over 5 race runs.
<!-- SECTION:NOTES:END -->
