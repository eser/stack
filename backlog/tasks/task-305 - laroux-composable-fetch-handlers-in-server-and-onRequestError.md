---
id: TASK-305
title: 'laroux: composable fetch handlers in /server and onRequestError'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-293
  - TASK-295
  - TASK-298
  - TASK-302
  - TASK-303
priority: medium
ordinal: 305000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 3.2, 15 and 16 (decision-54). `/server`: createHandler({ steps, onRequestError }), the step type, and the steps i18n(), sessions(), actions(), queries(), islands(), routes(), pages() and notFound(), each running its guard, route binding and proxy chain inside its own dispatch, with the proxy chain run once per request. The default composition when the app has no src/server.ts. onRequestError with its kinds and digest, from the root proxy.ts or createHandler, run through waitUntil, with control signals and expected ActionErrors excluded.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4m. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test puts a custom step before actions() that rewrites the URL and shows the guard and route binding still apply
- [ ] #2 A test shows the proxy chain runs once per request whichever endpoint step matches
- [ ] #3 Tests show onRequestError receives page, route, action, query, island and proxy errors with a digest, and the production body carries no message
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
