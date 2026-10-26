---
id: TASK-266
title: Move `noskills manager` and `noskills web` to Go and delete the TS packages
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go
  - noskills
  - cleanup
milestone: m-5
dependencies:
  - TASK-265
  - TASK-262
priority: medium
ordinal: 266000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement both commands in cmd/noskills on the Go server. Then delete noskills-web, mux and the remaining internal TS noskills modules, after checking that agents and other packages no longer import them.

Plan key: M5-T4. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both commands work from the Go binary
- [ ] #2 The deleted packages have no importers; the gate is green
<!-- AC:END -->
