---
id: TASK-132
title: >-
  Decide route param decoding and catch-all bare-prefix matching in
  standards/routes
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - standards
  - laroux
  - bug
dependencies: []
references:
  - pkg/@eserstack/standards/routes/matcher.ts
  - pkg/@eserstack/laroux/router
priority: medium
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
matchPattern in pkg/@eserstack/standards/routes/matcher.ts:91 returns params without percent-decoding ('/stories/hello%20world' gives slug 'hello%20world'), and laroux matchRoute (pkg/@eserstack/laroux/router/matcher.ts:14) passes that through. '/docs/[...path]' matches '/docs/' (path []) but not '/docs', while normalizePath('/docs/') returns '/docs', so a normalized index path never reaches its catch-all route.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Params are decoded or the raw form is documented, with tests
- [x] #2 A catch-all matches its bare prefix consistently with normalizePath, with tests in standards/routes and laroux's router matcher tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: Checked standards/routes/matcher.ts:
- params are percent-decoded, and a malformed escape keeps its raw form;
- a catch-all is split before its segments are decoded;
- the slash before a catch-all is optional.
laroux matchRoute delegates to it, and route-dispatcher uses the same matcher. The tests in standards/routes, laroux/router and laroux-server pass. The standards README is outside the unit's paths (in crossUnitNeeds).
<!-- SECTION:NOTES:END -->
