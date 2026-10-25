---
id: TASK-298
title: 'laroux: server islands with Defer, tokens, the props codec and the island endpoint'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-285
  - TASK-288
  - TASK-293
priority: medium
ordinal: 298000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 9. `Defer` in `/rsc/server` with stream and fetch modes and `auto` resolution (including bots); the props codec in `/islands` with its limits and previous-version decoding; signed and sealed tokens on the keyring; `handleIslandRequest` in `/rsc` with the dispatch order of section 9; `islandContext()`; the DeferBoundary client part with preload reuse and the transition swap; Cache-Control, Cache-Tag and Surrogate-Key on public responses; cookie and session writes throw in every island render. Follow L-S4 (S-I6) and L-S7 (S-I12).

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4f. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Codec tests cover every supported type, prototype keys, depth, entry and BigInt limits, null-prototype output and the previous codec version
- [ ] #2 Token tests cover deterministic signed tokens, random-IV sealed tokens, each tampered field, rotation and expiry
- [ ] #3 Endpoint tests cover an unknown id (404 without importing), 405, 413, navigate or document requests (404), a segment mismatch, public-scope throws and the cache headers
- [ ] #4 A test shows a layout-level Defer has the same URL on two pages, and bots get stream mode on a dynamic route
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
