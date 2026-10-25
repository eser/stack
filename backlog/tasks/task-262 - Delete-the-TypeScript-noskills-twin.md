---
id: TASK-262
title: Delete the TypeScript noskills twin
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - noskills
  - cleanup
milestone: m-4
dependencies:
  - TASK-261
priority: medium
ordinal: 262000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the migrated commands and modules from pkg/@eserstack/noskills, the agents git guard, go-noskills.ts (nothing imports it) and noskills/scripts/npm-build.ts. Keep only what noskills-web and `manager` need until M5, marked internal. Update the noskills README to describe the Go binary.

Plan key: M4-T7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pkg/@eserstack/noskills holds no implementation of a command that has a Go version
- [ ] #2 The golden harness runs against Go only; the gate is green
<!-- AC:END -->
