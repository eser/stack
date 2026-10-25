---
id: TASK-222
title: 'http, primitives, functions, streams and events: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - http
  - streams
  - tests
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Five small packages, one commit each. In the http README, the Deno.serve, ServeHandlerInfo and addSignalListener examples (README.md:32-238) become runtime.http and runtime.process. Drop the streams sanitizer overrides.

Plan key: M1-T28. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test` passes for each package
- [ ] #2 No Deno reference remains in them; tsc and oxlint are clean for each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 16 files, 14 pass, 2 fail: primitives 2/2 (115 tests), functions 4/4 (119), streams 4/4 (105), http 5 files, 4 pass (52 pass, 4 fail), events 1 file, 0 pass (10 pass, 1 fail).
- Semantics: http/adapter.test.ts:54, 4 fromRequest tests build `new Request` with a stream body and no `duplex: "half"`; events/container.test.ts:61-73 "no parameters": CustomEvent.detail defaults to null on Node and undefined on Deno.
- Sanitizer options to remove: streams 4, functions resources.test.ts 2.
- Source (comments only): http Deno. 1 (middlewares/rate-limiter.ts:37), functions Deno. 2 (triggers.ts:15,30).
- Docs: pkg/@eserstack/http/README.md (7), pkg/@eserstack/streams/README.md (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/events/container.test.ts: 1 failing, 10 passing; first error: AssertionError: Values are not strictly equal.
- pkg/@eserstack/http/adapter.test.ts: 4 failing, 15 passing; first error: see the run
<!-- SECTION:NOTES:END -->
