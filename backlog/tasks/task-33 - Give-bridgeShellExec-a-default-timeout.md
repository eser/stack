---
id: TASK-33
title: Give bridgeShellExec a default timeout
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
dependencies: []
references:
  - pkg/@eserstack/ajan/bridge.go
priority: low
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/ajan/bridge.go:5298-5331 runs processfx.Run(context.Background(), ...) with no timeout unless the TS caller sets one; processfx documents zero as no limit. Rule: coding-practices: External Calls Have Timeouts. Decide a default ceiling or document the no-limit default as intended.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A default timeout applies when the caller sets none, or the no-limit default is documented at the TS API
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-libs-bridge: Checked in the code. defaultShellExecTimeout is 10m and shellExecTimeout rejects a zero, negative or unparseable timeout. A command that hits the deadline gets an error naming the timeout. Command-mode WASM goes through the same function. The JSDoc of EserAjanShellExec in ffi/types.ts states the default. Tests are in bridge_shell_exec_test.go.
<!-- SECTION:NOTES:END -->
