---
id: TASK-218
title: 'httpclient and logging: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test` passes for both packages
- [ ] #2 No Deno reference remains; tsc and oxlint are clean for both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: httpclient 7 files, 6 pass, 1 fail (101 tests pass, 1 fail); logging 2 of 2 (47 tests).
- Deno API in tests: httpclient/go-client.test.ts:85 Deno.listen (the timeoutMs test): port to node:net.
- The withoutFfi `ignore:` conditions became `skip:` and work (go-client 1, logging logger.test.ts 6).
- Source: httpclient Deno. 1 (a comment in h3-fetch.ts:12); logging 0.
- Docs: pkg/@eserstack/logging/WIRING.md (7, the sanitizer section). pkg/ajan/httpclient and logfx are clean.
<!-- SECTION:NOTES:END -->
