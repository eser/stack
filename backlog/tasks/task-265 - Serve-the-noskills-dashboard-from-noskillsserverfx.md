---
id: TASK-265
title: Serve the noskills dashboard from noskillsserverfx
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 08:31'
labels:
  - go
  - noskills-web
  - frontend
milestone: m-5
dependencies:
  - TASK-264
priority: medium
ordinal: 265000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the noskills-web pages (templates, routes), SSE and the /mux WebSocket into noskillsserverfx with html/template and go:embed. The browser scripts and xterm.js stay as static assets. Port the auth tests.

Plan key: M5-T3. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every dashboard route renders from the Go server, and the auth tests are ported
- [x] #2 An end-to-end test runs the browser terminal against the Go /mux endpoint
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent; make ok and deno task cli ok passed here).
'noskills-server web [--root] [--port 3000] [--open] [--log-level WARN]' serves the dashboard on 127.0.0.1 over HTTP/1.1, separate from the daemon's HTTP/3 service. It reads NOSKILLS_WEB_TOKEN and NOSKILLS_WEB_DEBUG_ERRORS.
- Pages are html/template, embedded with go:embed.
- The browser scripts are byte-identical embedded copies, served through an explicit table. xterm.js still loads from jsDelivr with the same SRI digests.
- The /mux WebSocket uses golang.org/x/net/websocket from the existing x/net requirement.
- The dashboard logic went to noskillsfx (dashboard_state.go, dashboard_actions.go, dashboard_events.go), which TASK-266's manager can reuse.
Every TS route is ported (pages, /events SSE, /api/state, tabs, spec ledger and summary, actions, /mux, static). The auth checks run in the TS order: security headers, CSP, loopback Origin on mutations and /mux, JSON content type, and a constant-time X-Noskills-Token or /mux ?token=.
Ported tests: auth, server-auth, layout, server and server-log.
AC #2: dashboard_e2e_test.go plays client.js against a live server with a real pty: attach, new tab, input/output, resize, a second socket replacing the first, close tab. It passes 15 runs in a row under -race, and with CGO_ENABLED=0 and no JS runtime on PATH. etc/temp/ci/task-265-ci.patch would also run it in the mux-no-js-runtime job; it is not applied (owner).
The intentional differences are in the noskillsserverfx README. TS bugs are filed as a follow-up.
<!-- SECTION:NOTES:END -->
