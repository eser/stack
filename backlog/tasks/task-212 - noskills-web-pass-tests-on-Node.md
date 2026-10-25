---
id: TASK-212
title: 'noskills-web: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - noskills-web
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Change the server-log.test.ts:20-35 spawn to node, and drop the 14 sanitizer options in server-auth.test.ts. Keep runtime.http as it is.

Plan key: M1-T18. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test pkg/@eserstack/noskills-web` passes
- [ ] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 6 files, 4 pass, 2 fail; 49 tests pass, 3 fail.
- Deno-style spawn: server-log.test.ts:20-35 uses `execPath() run` (1 test).
- fetch semantics: server-auth.test.ts:51-65, the two "/mux upgrade ... refused" tests, call fetch with `headers: { upgrade: "websocket" }`, which undici forbids ("fetch failed"); use node:http or node:net for the raw request.
- Sanitizers: 14 options in server-auth.test.ts and 1 in server.test.ts; nothing depended on them.
- Source: Deno., Bun., jsr: and npm: are 0. Docs: pkg/@eserstack/noskills-web/README.md (2).
<!-- SECTION:NOTES:END -->
