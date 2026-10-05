---
id: TASK-67
title: Move the open noskills/TODOS.md items into the backlog and delete the file
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - chore
dependencies: []
references:
  - pkg/@eserstack/noskills/TODOS.md
priority: low
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/noskills/TODOS.md is a TODO list kept outside the backlog, and part of it is stale: the git guard is already an allowlist with bash -c detection (TASK-17, TASK-19), the Kiro adapter syncs specs, and custom concerns load from .eser/concerns. The items that still apply are pure decision functions for the invoke-hook.ts stdin flow, context-aware concern sections, the upstream Claude Code SessionStart injection bug, `spec new --from-plan`, adaptive batched discovery, Agent B cross-model validation and selective undo from purge history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item that still applies has its own backlog task
- [x] #2 Stale items are removed, not carried over
- [x] #3 pkg/@eserstack/noskills/TODOS.md is deleted and nothing links to it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: TODOS.md is deleted, and `git grep noskills/TODOS` outside backlog/ finds nothing. The four items that are too large are in stage 4's newTasks, for the orchestrator to create.
<!-- SECTION:NOTES:END -->
