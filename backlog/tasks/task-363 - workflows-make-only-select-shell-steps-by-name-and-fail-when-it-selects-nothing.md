---
id: TASK-363
title: >-
  workflows: make --only select shell steps by name and fail when it selects
  nothing
status: To Do
assignee: []
created_date: '2026-10-25 22:19'
labels:
  - workflows
  - bug
dependencies: []
priority: medium
ordinal: 366000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-230. `eser workflows run --only <name>` matches tool names, not the names of shell steps, so `pnpm cli workflows run -e precommit --only go-lint` runs no step and still prints "All checks passed!". A filter that selects nothing reads as a green gate. docs/agents/workflow.md documents the current behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --only matches a shell step by its name as well as a tool by its name, in the TypeScript engine and the Go workflowfx engine, with tests
- [ ] #2 A run whose filters select no step exits non-zero and names the filter, instead of printing that all checks passed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27. The Go half landed with TASK-248: workflowfx's RunWorkflow matched `step.Name` (the tool name) only (pkg/ajan/workflowfx/engine.go, the Only check in the step loop). It now matches the tool name or the step's `name` option, and RunByEvent and RunWorkflowWithConfig return ErrNoStepSelected, naming the filter and listing the steps, when no declared step matches. Tests: pkg/ajan/workflowfx/only_filter_test.go and TestWorkflowsRunOnly in cmd/eser. The TypeScript engine (pkg/@eserstack/workflows/engine.ts, `resolved.name !== options.only`) is unchanged.
<!-- SECTION:NOTES:END -->
