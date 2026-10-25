---
id: TASK-302
title: 'laroux: sessions API and the session driver port'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-285
  - TASK-293
priority: medium
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 12 (decision-54). `session()` in `/rsc/server` with get, set, delete, regenerate, destroy and id; lazy reading and writing; ids from 256 random bits; values through the island props codec; the write rules (actions, route handlers, proxy.ts only) and the throw in cacheable output and public scope; refresh after a session change in a serial action; bindToSession on sealed values; the `sessions()` handler step (TASK-305 composes it); the SessionDriver port, a shared driver contract test suite, and the memory and sealed-cookie drivers. laroux-server ships the KV driver (TASK-312).

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4j. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The driver contract suite passes for the memory and cookie drivers
- [ ] #2 Tests show no Set-Cookie when a session is only read or never touched, and a write outside an action, route handler or proxy throws
- [ ] #3 A test shows regenerate() changes the id and keeps the data, and the old id no longer loads
- [ ] #4 A test shows session() throws in a public-scope island and on a prerendered route
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
