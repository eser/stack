---
id: TASK-301
title: 'laroux: partial prerendering'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-287
  - TASK-300
priority: medium
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 10.2 (decision-54). The `prerender: "partial"` route export; the Flight prerender helpers in `/rsc` with postponed dynamic APIs; the stitcher in `/ssr` that streams the prelude, renders Flight in full and calls react-dom resume; the build-time error for a dynamic API outside a Suspense boundary on a partial route; the CSP approach L-S6 chose. laroux-server's prerender step and runtime (TASK-308, TASK-309) store and serve the prelude and postponed state.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4i. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fixture partial route streams its prelude at once and fills its holes per request on Node, with the measurements L-S6 recorded
- [ ] #2 A dynamic API outside any Suspense boundary on a partial route fails the build
- [ ] #3 Seals in the prelude carry no expiry and session reads in it fail the build (doc-3 section 6.4)
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
