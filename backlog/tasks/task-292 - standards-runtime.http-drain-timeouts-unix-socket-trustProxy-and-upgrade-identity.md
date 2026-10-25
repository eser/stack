---
id: TASK-292
title: 'standards: runtime.http drain, timeouts, unix socket, trustProxy and upgrade identity'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - standards
  - http
  - track-l
milestone: m-7
dependencies:
  - TASK-180
  - TASK-241
priority: medium
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-2's runtime.http section beyond TASK-180's peer address: graceful drain with a timeout (close, closeIdleConnections, then closeAllConnections), headers, request and keep-alive timeouts, an optional unix socket, opt-in trustProxy for request.url and the peer address, and the documented upgrade identity rule (the upgrade Response is returned as the same object, node-http.ts:494). laroux-server's runtime and dev server both use it (doc-3 section 3.2). S9's result (L-S4) decides whether anything else is needed.

Plan key: L3. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests cover drain with an in-flight request, each timeout, a unix socket listener and trustProxy on and off
- [ ] #2 A test upgrades a WebSocket through a wrapper that returns the same Response object
- [ ] #3 The standards README documents the options, and the gate passes
<!-- AC:END -->
