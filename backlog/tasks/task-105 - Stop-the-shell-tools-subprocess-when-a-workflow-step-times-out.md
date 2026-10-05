---
id: TASK-105
title: Stop the shell tool's subprocess when a workflow step times out
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - workflows
  - bug
dependencies: []
references:
  - pkg/@eserstack/workflows/engine.ts
  - pkg/@eserstack/workflows/shell-tool.ts
priority: medium
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The workflows engine enforces step timeouts with task.withTimeout (engine.ts:117), which abandons the promise but leaves the `sh -c` child started by shell-tool.ts running. A timed-out step keeps its process alive for the rest of the run and after it. Rules: coding-practices: External Calls Have Timeouts; design-principles: Cancellation Flows With the Work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tool.run receives the step timeout or an AbortSignal and shell-tool applies it to the command
- [x] #2 A test with a step that sleeps past its timeout shows the child process is gone
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified:
- runStepTool passes { timeoutMs, signal }. At the deadline it aborts the signal, waits up to STOP_GRACE_MS, then fails the step.
- shellTool applies CommandBuilder.timeout(context.timeoutMs).
- shell-tool.test.ts has a step that sleeps past its 0.5 s timeout, and checks with kill -0 that the child is gone. It passes.
- engine.test.ts covers the context lifecycle, timeout validation and defaultTimeout validation.
- The README and types JSDoc match the code.
<!-- SECTION:NOTES:END -->
