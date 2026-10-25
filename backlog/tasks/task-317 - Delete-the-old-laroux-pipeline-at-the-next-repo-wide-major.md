---
id: TASK-317
title: 'Delete the old laroux pipeline in the major after R1'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - laroux-server
  - laroux-react
  - laroux-bundler
  - cleanup
  - track-l
milestone: m-7
dependencies:
  - TASK-307
  - TASK-313
  - TASK-315
priority: high
ordinal: 317000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-58, the old pipeline is deprecated for one 5.x minor only. Prepare this task while the R1 minor is in review, and land it on main right after the owner releases that minor, so the next release is 6.0.0. Delete what track L replaced, one commit per package: laroux-react and laroux-bundler entirely; in laroux-server the old runtime/server.ts ladder, adapters/react, the /_rsc and /rsc endpoints, html-shell, action-registry, build-module and the Deno-era options; in bundler the old backend API; tests tagged `track-l-delete`. Review the supersession candidates doc-2 lists (TASK-169, TASK-96, TASK-97, TASK-161, TASK-89, TASK-90, TASK-116, parts of TASK-66 and TASK-93) and close each with a note. Add a CHANGELOG Migration entry for every removed export.

Plan key: L9. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pkg/@eserstack/laroux-react and pkg/@eserstack/laroux-bundler are gone and nothing imports them
- [ ] #2 `git grep -n 'track-l-delete'` returns nothing, and each supersession candidate is closed with a note
- [ ] #3 CHANGELOG Migration lists every removed export, and the gate passes
<!-- AC:END -->
