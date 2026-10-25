---
id: TASK-326
title: Fix the TypeScript noskills run loop's state handling
status: Done
assignee: []
created_date: '2026-10-25 01:29'
updated_date: '2026-10-25 02:13'
labels:
  - noskills
  - bug
dependencies: []
priority: medium
ordinal: 329000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-260; the Go run loop does these correctly. (1) commands/run.ts:111 and :284 use writeState, not writeStateAndSpec, so the spec's own state stays SPEC_APPROVED/BLOCKED; persistence.ts:338 reads that file first, so the agent's 'spec <name> next' sees the wrong phase. (2) commands/run.ts:239 reads the global state, which commands/done.ts:122 sets to IDLE, so a spec the agent finished never reaches the COMPLETED exit ('Unexpected phase: IDLE', exit 1). (3) commands/run.ts:187 turns any stop on the last allowed iteration into exit 2 'Max iterations reached'. (4) state/iteration.ts:302 (setDriver) and :272 (recordIteration) write only state.json; the agent's next 'spec <name> next' or 'block' rewrites it from the spec file, dropping the claim (so the Stop hook also records) and the recorded count. (5) machine.ts:448 advanceExecution and recordIteration both increment execution.iteration, so one turn with a progress report counts twice. (6) commands/run.ts:441 records after every turn, including one that left EXECUTING, and after done records into the IDLE state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item has a failing test and is fixed in TS (Go already behaves), or is documented as intended
- [x] #2 The run parity test (NOSKILLS_RUN_PARITY=1) still passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, TS fixes (commands/run.ts, state/iteration.ts):
(1) Starting from SPEC_APPROVED and submitting a BLOCKED resolution use writeStateAndSpec, so the spec's own file (read first by 'spec <name> next') moves too.
(2) Each turn reads the spec's own state (readLoopState: the spec file when it names the spec, else state.json). A spec the agent finished with 'spec test done' ends the next turn with 'Spec completed!' and 0, although state.json is IDLE.
(3) A turn that stops the loop on the last allowed iteration keeps its exit code; exit 2 and 'Max iterations reached' only when the iterations ran out.
(4) setDriver and recordIteration also copy execution into the spec's own state file when it names the spec (copyExecutionToSpec), as Go's setRunDriver/RecordRunIteration do.
(6) A turn that left EXECUTING is not recorded.
Tests: new commands/run-loop.test.ts drives the real CLI against a fake claude on PATH (the stand-in from cmd/noskills/run_binary_test.go):
- the agent's turn sees EXECUTING and the claim in the spec file;
- a finished spec ends with 0 and leaves state.json IDLE at iteration 0;
- a failing agent on the last iteration exits 1, not 2;
- running out of iterations still exits 2.
The first two failed before the fix; the third was written after it (by reading, the old code exits 2).
deno test pkg/@eserstack/noskills: 504 passed.
Still open: (5), the double count. machine.ts advanceExecution and recordIteration both increment execution.iteration. Fixing it changes 'next' output in TS and Go (noskillsfx copies advanceExecution), so it needs the lifecycle goldens re-recorded. That waits until the concurrent TASK-258.1/259.1 noskillsfx work compiles. Also open: AC #2, the NOSKILLS_RUN_PARITY run.

2026-10-25: rtk make ok and deno task cli ok passed with all agent work in place. Item (5): documented as intended. Only state/machine.ts:448 advanceExecution and iteration.recordIteration increment execution.iteration, and no production code calls advanceExecution: the Stop hook and 'noskills run' count with recordIteration, and 'next' stores lastProgress without counting. advanceExecution's JSDoc now says a library caller uses one of the two per turn, never both. AC #2: NOSKILLS_RUN_PARITY=1 TestRunBinaryMatchesTypeScript passes against the fixed TS loop.
<!-- SECTION:NOTES:END -->
