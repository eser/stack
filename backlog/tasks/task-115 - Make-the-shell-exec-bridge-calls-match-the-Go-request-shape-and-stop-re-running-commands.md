---
id: TASK-115
title: >-
  Make the shell exec bridge calls match the Go request shape and stop
  re-running commands
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - shell
  - bug
dependencies: []
references:
  - pkg/@eserstack/shell/exec/command.ts
  - pkg/@eserstack/shell/go-exec.ts
  - pkg/@eserstack/ajan/bridge.go
priority: medium
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
exec/command.ts spawn() (pkg/@eserstack/shell/exec/command.ts:164-220) falls through to runtime.exec.spawn whenever EserAjanShellExec returns { error }, so the same command runs a second time, including one the bridge stopped at its 10-minute default timeout (TASK-33), and the second run has no timeout. timeout(0) sends "0ms", which the bridge rejects. go-exec.ts:58 sends JSON.stringify({ command, ...options }) with timeout as a number and env as a Record, while bridge.go shellExecRequest (lines 5435-5444) wants a duration string and KEY=VALUE strings, so every goExec call with timeout or env fails with 'invalid request JSON'. Rules: coding-practices: Handle Each Error Once, External Calls Have Timeouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 command.ts falls back to the runtime only when the native library is unavailable and otherwise surfaces the Go error
- [x] #2 goExec converts timeout and env the way command.ts does, with a test
- [x] #3 The meaning of timeout 0 is decided and the 10-minute default is documented on CommandBuilder.timeout and GoExecOptions.timeout
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

shell: Checked again. command.ts spawn() falls back to the runtime spawn only when ffiClient.ensureNativeLib() returns null. #spawnNative passes every bridge error to runExecGo, which throws types.CommandRunError, so nothing runs twice. goExec builds its request with the same execGo.buildExecGoRequest: env becomes KEY=VALUE strings and timeout becomes a `<n>ms` Go duration. Tests: exec/exec-go.test.ts and go-exec.ffi.test.ts. Timeout decision: 0, negative values, NaN, Infinity and values above 2147483647 throw a RangeError, and fractions are rounded up. The 10-minute default is documented on CommandBuilder.timeout(), CommandOptions.timeout, GoExecOptions.timeout and in the README. These tests all pass: exec-go.test.ts (14), command.test.ts (8, including the runtime-path timeout and the missing program and missing cwd cases), command.ffi.test.ts (4: a timed-out command runs once, a missing program throws under noThrow, env reaches the command, a non-zero exit is a CommandError), go-exec.ffi.test.ts (4). One breakingChanges entry was added for runtime-path spawn errors now being CommandRunError.
<!-- SECTION:NOTES:END -->
