---
id: TASK-212
title: 'noskills-web: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
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
- [x] #1 `node --test pkg/@eserstack/noskills-web` passes
- [x] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 6 files, 4 pass, 2 fail; 49 tests pass, 3 fail.
- Deno-style spawn: server-log.test.ts:20-35 uses `execPath() run` (1 test).
- fetch semantics: server-auth.test.ts:51-65, the two "/mux upgrade ... refused" tests, call fetch with `headers: { upgrade: "websocket" }`, which undici forbids ("fetch failed"); use node:http or node:net for the raw request.
- Sanitizers: 14 options in server-auth.test.ts and 1 in server.test.ts; nothing depended on them.
- Source: Deno., Bun., jsr: and npm: are 0. Docs: pkg/@eserstack/noskills-web/README.md (2).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/noskills-web/browser-scripts.test.ts: 5 failing, 3 passing; first error: see the run
- pkg/@eserstack/noskills-web/server-auth.test.ts: 2 failing, 8 passing; first error: see the run
- pkg/@eserstack/noskills-web/server-log.test.ts: 1 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/ajan/noskillsserverfx/web/browser_scripts.test.ts: 1 failing, 0 passing; first error: SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode

Done (2026-10-25, node 26.12.1):
- server-log.test.ts spawns `node <probe>` (was `execPath() run --allow-all`).
- server-auth.test.ts: the two /mux upgrade tests send the request over node:http (`upgradeStatus` helper); the sanitizer options were already gone after TASK-198.
- browser-scripts.test.ts and pkg/ajan/noskillsserverfx/web/browser_scripts.test.ts: the client.js harness installs an `addEventListener` stand-in, since Node's globalThis is no event target.
- pkg/ajan/noskillsserverfx/web/browser_scripts.test.ts: parameter properties became fields assigned in the constructor; fixtures are read with node:fs/promises, since Node's fetch does not read file: URLs. Static JS behavior is unchanged.
- templates/layout.ts: `PAGE_CSP: string` for isolatedDeclarations (TS9010).
- Static JS comments and README line 16 no longer name Deno.
- Result: node --test on the package 67/67, browser_scripts.test.ts 24/24; tsc reports nothing under either path; oxlint 0 findings.
- Left: package.json keeps the `@std/testing` devDependency, which nothing imports; dropping it needs a lockfile update.
<!-- SECTION:NOTES:END -->
