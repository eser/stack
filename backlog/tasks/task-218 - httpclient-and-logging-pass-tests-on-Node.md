---
id: TASK-218
title: 'httpclient and logging: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - httpclient
  - logging
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One commit per package. In httpclient, port Deno.listen and connect in go-client.test.ts to node:net, and keep the withoutFfi conditions as skip. In logging, keep the withoutFfi skips and rewrite the Deno sanitizer section of logging/WIRING.md.

Plan key: M1-T24. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test` passes for both packages
- [x] #2 No Deno reference remains; tsc and oxlint are clean for both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: httpclient 7 files, 6 pass, 1 fail (101 tests pass, 1 fail); logging 2 of 2 (47 tests).
- Deno API in tests: httpclient/go-client.test.ts:85 Deno.listen (the timeoutMs test): port to node:net.
- The withoutFfi `ignore:` conditions became `skip:` and work (go-client 1, logging logger.test.ts 6).
- Source: httpclient Deno. 1 (a comment in h3-fetch.ts:12); logging 0.
- Docs: pkg/@eserstack/logging/WIRING.md (7, the sanitizer section). pkg/ajan/httpclient and logfx are clean.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/httpclient/go-client.test.ts: 1 failing, 7 passing; first error: see the run

Done (2026-10-26, node 26.12.1):
- httpclient/go-client.test.ts: the timeoutMs test listens through node:net (net.createServer on 127.0.0.1 port 0, never answers) and destroys the accepted sockets before server.close(). It failed with `ReferenceError: Deno is not defined` before the port.
- httpclient/h3-fetch.test.ts: the `this` binding test pushes `this` into an array, so typescript/no-this-alias no longer fires; no pragma.
- Deno and Bun comments removed from httpclient h3-fetch.ts and client.ts and from logging context.ts; the createH3FetchFn error names Node or a browser; h3-fetch.ts names NODE_EXTRA_CA_CERTS for a self-signed certificate.
- logging/WIRING.md: the sanitizer section names no runtime; on node:test the top-level ensureLib() stays for the `skip` flags. The withoutFfi skips stay in both packages (go-client 1, logger.test.ts 6).
- Checks: node --test --test-force-exit: httpclient 102 of 102, logging 47 of 47, with the native library loaded (0 skipped). tsc --noEmit: no line for either package. oxlint: 0 diagnostics on 31 files. oxfmt --check clean. grep -wi for deno and bun: none.
- Left: logging/package.json still lists the devDependency @std/assert, used only by the JSDoc example in sinks.ts and the README testing example. Dropping it needs a lockfile refresh.
<!-- SECTION:NOTES:END -->
