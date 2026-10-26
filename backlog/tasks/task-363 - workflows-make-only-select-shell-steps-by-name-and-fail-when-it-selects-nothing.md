---
id: TASK-363
title: >-
  workflows: make --only select shell steps by name and fail when it selects
  nothing
status: Done
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
- [x] #1 --only matches a shell step by its name as well as a tool by its name, in the TypeScript engine and the Go workflowfx engine, with tests
- [x] #2 A run whose filters select no step exits non-zero and names the filter, instead of printing that all checks passed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27. The Go half landed with TASK-248: workflowfx's RunWorkflow matched `step.Name` (the tool name) only (pkg/ajan/workflowfx/engine.go, the Only check in the step loop). It now matches the tool name or the step's `name` option, and RunByEvent and RunWorkflowWithConfig return ErrNoStepSelected, naming the filter and listing the steps, when no declared step matches. Tests: pkg/ajan/workflowfx/only_filter_test.go and TestWorkflowsRunOnly in cmd/eser. The TypeScript engine (pkg/@eserstack/workflows/engine.ts, `resolved.name !== options.only`) is unchanged.

2026-10-26. The TypeScript half. Root cause: pkg/@eserstack/workflows/engine.ts:290 (before the fix) compared `options.only` with `resolved.name`, the tool name, and every shell step runs the `shell` tool, so a shell step's `name` option never matched. Nothing checked that the filter selected a step: runByEvent returned an empty result, and reportResults in run.ts printed "All checks passed!" because `[].every(...)` is true. Fix: engine.ts matches `--only` against the tool name or the `name` option (stepMatches), and runByEvent and runWorkflowWithConfig run checkOnly over the resolved workflows before any step runs; when no declared step matches, they fail with "No step matches --only '<filter>'", the fix and the step names, so `eser workflows run` exits 1. The check spans every workflow of the event, as in Go, because one workflow may hold the step and another not. Test (failed first, 5 of 7): pkg/@eserstack/workflows/only-filter.test.ts, the cases of the Go only_filter_test.go. RunOptions.only, the `--only` help line, the workflows README and docs/agents/workflow.md now describe the shared behavior, and CHANGELOG.md has migration entries under @eserstack/workflows and workflowfx. Checked by hand: `pnpm cli workflows run -e precommit --only nope` exits 1 naming the filter, and `--only go-lint` runs the go-lint shell step. `pnpm ok` passes.
<!-- SECTION:NOTES:END -->
