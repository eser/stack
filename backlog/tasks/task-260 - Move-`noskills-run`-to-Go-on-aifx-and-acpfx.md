---
id: TASK-260
title: Move `noskills run` to Go on aifx and acpfx
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 01:42'
labels:
  - go
  - noskills
  - ai
milestone: m-4
dependencies:
  - TASK-258
priority: medium
ordinal: 260000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the run command on the Go AI layer that noskills-server already links, including streaming output and cancellation. `manager` and `web` forward to the TS packages until M5.

Plan key: M4-T5. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Run fixtures with a fake provider pass
- [x] #2 Ctrl-C cancels the request and leaves the state consistent
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent).
noskills run is in Go: cmd/noskills/run.go plus noskillsfx/lifecycle_run.go, on aifx's claude-code provider (acpfx and its shim). The loop:
- run.ts's start checks; SPEC_APPROVED moves to EXECUTING; the git wrapper goes on PATH unless allowGit; the driver claim (driver acp plus driverPid);
- per iteration: COMPLETED exits 0; BLOCKED either appends to blocked.log and exits 1 with --unattended or prompts for a resolution; EXECUTING compiles with headless hints, builds the prompt and streams the turn;
- after a turn: record the iteration, then auto-commit with the real git;
- PATH is restored and the claim released on every exit; --max-iterations exhaustion exits 2.
AC #1: run_test.go uses a fake aifx ProviderFactory: completion, max iterations, BLOCKED in all three ways, refusals, start and stream failures, auto-commit. run_binary_test.go drives the built binary through the real ACP path against a fake claude CLI. TestBuildRunPromptMatchesTypeScript is byte-identical to the recorded TS prompts. TestRunBinaryMatchesTypeScript (NOSKILLS_RUN_PARITY=1, needs deno) gives the same exit code, stdout and files as TS.
AC #2: TestRunCancelledMidStream (context cancel) and TestRunBinaryInterruptReleasesTheTurn (SIGINT to the binary) both end with exit 130, the claim released, valid state files, iteration 0, and the fake claude gone.
Go differs from TS:
- the agent's stream is printed;
- Ctrl-C releases the claim (TS leaves a dead pid);
- the claim, execution start, BLOCKED resolution and iterations are also written to specs/<name>.json;
- a turn is recorded only while EXECUTING;
- 'spec done' ends with 'Spec completed!' and 0 (TS: 'Unexpected phase: IDLE', 1);
- exit 2 only when iterations run out.
TS bugs are filed as a follow-up. manager, web and watch still forward to TS (watch is TASK-260.1). Closing waits on the full gate with TASK-259 finished.

2026-10-25: rtk make ok and deno task cli ok passed with all agent work in place.
<!-- SECTION:NOTES:END -->
