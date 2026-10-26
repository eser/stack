---
id: TASK-181
title: 'laroux-server: serve through runtime.http, bundle dev with rolldown, drop .tsx'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:51'
labels:
  - laroux-server
  - http
  - bundler
milestone: m-0
dependencies:
  - TASK-180
priority: high
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runtime/server.ts, replace Deno.ServeHandlerInfo (:350), Deno.upgradeWebSocket for /hmr (:373) and Deno.serve (:860) with runtime.http.serve and runtime.http.upgradeWebSocket. Pass config.server.host explicitly, because runtime.http defaults to 127.0.0.1. Key the rate limiter on info.remoteAddr. Switch `laroux dev` and watch rebuilds from deno-bundler to rolldown (main.ts:203, :281, :302). Rename adapters/react/render-app.tsx to .ts; it already uses createElement.

Plan key: M0-T8. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 laroux-server has no Deno.* in non-test code, no .tsx file and no 'deno-bundler' string
- [x] #2 A test shows that two peers with different remote addresses get separate rate-limit buckets
- [x] #3 `laroux serve` binds to the configured host; `laroux dev` on a fixture rebuilds with rolldown and the HMR WebSocket test passes
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. runtime/server.ts: the handler takes crossRuntime.ServeHandlerInfo, /hmr upgrades through runtime.http.upgradeWebSocket, the rate limiter is keyed on info.remoteAddr (the socket peer), and startHTTPServer is async on runtime.http.serve with hostname: config.server.host (default localhost; Deno.serve bound every interface before), plus an options object with onListen and signal. main.ts awaits it and logs the bound port; dev, watch rebuilds and serve all use the rolldown backend. adapters/react/render-app.tsx was renamed to render-app.ts with git mv (so the rename is staged in the index) and its three importers updated. Tests: two peers with different remote addresses get separate rate-limit buckets (runtime/server.test.ts); startHTTPServer binds 127.0.0.1 from config and an HMR WebSocket client on /hmr receives the update message; domain/server-modules.test.ts's dev-rebuild test (changed page, route.ts and proxy.ts after a rebuild) now builds with rolldown and passes; laroux-bundler's three dev-mode build tests also moved to rolldown and pass. No Deno.*, .tsx or deno-bundler string remains in laroux-server sources and tests (dist/ is build output). deno task cli ok passed.
<!-- SECTION:NOTES:END -->
