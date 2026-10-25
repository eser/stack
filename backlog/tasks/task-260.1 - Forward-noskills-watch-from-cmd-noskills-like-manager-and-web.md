---
id: TASK-260.1
title: Forward noskills watch from cmd/noskills like manager and web
status: Done
assignee: []
created_date: '2026-10-24 20:51'
updated_date: '2026-10-25 02:13'
labels: []
milestone: m-4
dependencies:
  - TASK-257
parent_task_id: TASK-260
priority: low
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-256 gap table: noskills watch (the read-only live dashboard, -o json or -o markdown) has no Go version and no M4 task. Forward it to the TypeScript CLI as TASK-260 does for manager and web, until M5 (TASK-266) ports the dashboards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cmd/noskills watch reaches the TypeScript watch with its arguments
- [x] #2 make ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done with TASK-258.1). cmd/noskills/spec_states_test.go checks that 'noskills watch' reaches the TS watch with its arguments unchanged, that the exit code passes through, and that NOSKILLS_NO_FORWARD=1 refuses it. The README lists watch with manager and web as forwarded until M5. make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
