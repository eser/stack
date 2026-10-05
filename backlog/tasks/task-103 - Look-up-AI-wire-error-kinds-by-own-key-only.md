---
id: TASK-103
title: Look up AI wire error kinds by own key only
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ai
  - bug
dependencies: []
references:
  - pkg/@eserstack/ai/errors.ts
priority: low
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
classifyWireError in pkg/@eserstack/ai/errors.ts:192 indexes the plain object WIRE_KINDS (line 158) with the kind string from the bridge. A kind such as "constructor" or "toString" returns an Object.prototype member, and `new ErrorClass(...)` then returns or throws the wrong thing instead of a bare AiError.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The lookup uses a Map or Object.hasOwn
- [x] #2 A test with kind "constructor" gets an AiError
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified: WIRE_KINDS is a Map, and classifyWireError uses .get(kind). errors-wire.test.ts checks constructor, toString, valueOf, hasOwnProperty and __proto__. The related prototype-key fixes in ask.ts, adapters/mod.ts and content.ts each have a test.
<!-- SECTION:NOTES:END -->
