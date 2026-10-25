---
id: TASK-307
title: 'laroux: take over laroux-react''s surviving modules and deprecate laroux-react'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-296
  - TASK-297
priority: medium
ordinal: 307000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-46 removes laroux-react. Move the modules that survive track L into @eserstack/laroux `/client` (runtime/navigation, runtime/image, span-renderer, use-function after its react-server check), keep library code as .ts with createElement (decision-17), and deprecate laroux-react: its README and package.json say so and point to the new subpaths, and its exports stay working until TASK-317. Cross-package notes for the consumers.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

The deprecation lasts one 5.x minor (decision-58): say so in the deprecation notice and the CHANGELOG.

Plan key: L4o. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The moved modules pass their tests from @eserstack/laroux
- [ ] #2 laroux-react is marked deprecated with pointers, and existing apps still build against it
- [ ] #3 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
