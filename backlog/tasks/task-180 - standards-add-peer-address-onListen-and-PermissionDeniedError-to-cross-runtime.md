---
id: TASK-180
title: >-
  standards: add peer address, onListen and PermissionDeniedError to
  cross-runtime
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:37'
labels:
  - standards
  - cross-runtime
  - http
milestone: m-0
dependencies: []
priority: high
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Changes in cross-runtime:
- HttpHandler (types.ts:903) becomes (request, info), where info carries remoteAddr. Node fills it from req.socket.remoteAddress; the Deno and Bun adapters get the minimum change needed to stay green until M1-T7 deletes them.
- ServeOptions gains onListen, and callers pass hostname explicitly.
- Add PermissionDeniedError, mapped from EACCES and EPERM.
- Remove the kv capability flag, which has no API behind it.
Update the adapters' tests and the README. Record the kv removal for the M1-T36 Migration entry.

Plan key: M0-T7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Node adapter test proves the handler receives remoteAddr
- [x] #2 PermissionDeniedError is exported and covered by a Node adapter test
- [x] #3 No kv capability remains
- [x] #4 The standards README documents the info argument
- [x] #5 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. cross-runtime/types.ts: HttpHandler is (request, info: ServeHandlerInfo) with info.remoteAddr: NetAddr | null; ServeOptions has onListen(addr), called before serve resolves; new PermissionDeniedError(path, { cause }); the kv capability flag is gone from the type and all six adapters. Node (node-http.ts) fills remoteAddr from the request socket and the upgrade socket (remoteAddress/remotePort), node-shared.ts maps EACCES and EPERM to PermissionDeniedError. Deno and Bun got the minimum: Deno passes Deno.serve's info.remoteAddr (tcp/udp), Bun uses server.requestIP; both call onListen. createSafeHandler passes info through. NetAddr, ServeHandlerInfo and PermissionDeniedError are exported from mod.ts. The shared HTTP contract (testdata/http-scenario.ts) now checks onListen and that /hello sees peer 127.0.0.1 with a port, so the Node adapter proves remoteAddr both on Deno's node:http and on a real Node (node.test.ts); a real-Node probe in node.test.ts reads a mode-000 file and gets PermissionDeniedError with path and cause EACCES. The only serve caller (noskills-web) already passes hostname. README documents info, onListen and the fs errors. The kv removal and the info argument are noted on TASK-230 (M1-T36). deno task cli ok passed.
<!-- SECTION:NOTES:END -->
