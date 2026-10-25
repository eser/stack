---
id: TASK-316
title: 'Recipes: laroux-app and laroux-workers-app on R1'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - recipes
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-310
  - TASK-312
priority: medium
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move .eser/recipes/laroux-app to the R1 shape: @eserstack/laroux from npm and laroux as a devDependency (decision-47), scripts on the laroux bin, a page with an island, an action with useActionState, a Defer, and no deprecated imports. Add .eser/recipes/laroux-workers-app with the workerd target, wrangler config and the cookie session driver; it replaces the role of cf-workers-app for laroux apps (cf-workers-app stays for plain Workers). Note on TASK-240 that the template patches follow this shape.

The recipes pin the newest react, react-dom and rsdw releases (decision-59).

Plan key: L7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both recipes scaffold with the kit command and pass `laroux build`, and laroux-workers-app runs in `wrangler dev`
- [ ] #2 TASK-240 has a note pointing at the R1 recipe shape, and the gate passes
<!-- AC:END -->
