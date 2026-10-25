---
id: m-5
title: "M5 Daemon and dashboard without a JS runtime"
---

## Description

noskills-server runs mux sessions in Go and serves the dashboard from embedded templates, so the daemon ships with no TypeScript.

Exit criteria:
- noskills-server runs mux sessions with no node, bun or deno on PATH (CI job)
- Dashboard pages, SSE and the /mux WebSocket are served by noskillsserverfx
- noskills-server-worker, mux, noskills-web and the remaining TS noskills modules are deleted; the gate is green
