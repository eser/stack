---
id: TASK-119
title: 'Add HTTP serve, WebSocket upgrade and signal listeners to cross-runtime'
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - standards
  - noskills-web
  - feature
dependencies: []
references:
  - pkg/@eserstack/standards/cross-runtime/types.ts
  - pkg/@eserstack/noskills-web/server.ts
  - pkg/@eserstack/noskills-web/terminal/ws-bridge.ts
priority: low
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
noskills-web calls Deno.serve (server.ts:250), Deno.addSignalListener and Deno.removeSignalListener (server.ts:273) and Deno.upgradeWebSocket (terminal/ws-bridge.ts:26) directly, because @eserstack/standards/cross-runtime has no equivalent. The server therefore runs only on Deno. Rule: javascript-practices: Cross-Runtime APIs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cross-runtime exposes serve, WebSocket upgrade and signal listeners for Deno, Node and Bun
- [x] #2 noskills-web uses them and no longer calls Deno.* in library code
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Verified:
- runtime.http.serve and upgradeWebSocket plus process.add/removeSignalListener exist on the Deno, Node (node-http.ts, websocket-frames.ts, server-websocket.ts) and Bun adapters, with capabilities.http and throwing stubs on workerd and browser.
- The shared HTTP contract passes in-process on Deno and under real Node and Bun; the signal probe passes on all three.
- No `Deno.*` remains in noskills-web outside *.test.ts.
- No runtime object built by hand elsewhere in the repo breaks: laroux-runtime and laroux-server type-check.
<!-- SECTION:NOTES:END -->
