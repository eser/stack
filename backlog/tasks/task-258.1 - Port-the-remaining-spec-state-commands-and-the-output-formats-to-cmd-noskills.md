---
id: TASK-258.1
title: Port the remaining spec state commands and the output formats to cmd/noskills
status: Done
assignee: []
created_date: '2026-10-24 20:51'
updated_date: '2026-10-25 02:13'
labels: []
milestone: m-4
dependencies:
  - TASK-257
parent_task_id: TASK-258
priority: medium
ordinal: 319000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-256 gap table: behaviors that no M4 task named, closest to the spec lifecycle. Port to Go, matching the TypeScript twin and the golden harness (pkg/ajan/noskillsfx/golden): the block, cancel, reset, reopen, wontfix and free commands (cancel and wontfix keep the terminal phase in the per-spec file and reset the global store to IDLE); review and delegate, with approve blocking on pending delegations; spec list, spec <name>, split, revisit, ac, task and note; validate (exit 1 while blockers remain); plan-export (.claude/plan.md); the events log (.eser/.state/events/events.jsonl); the legacy layout migration and the commented .eser/.gitignore scaffold; and the -o json, markdown and text output formats with the agent and human modes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed command and behavior runs from cmd/noskills and matches the TypeScript output on a golden scenario
- [x] #2 make ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent; make ok and deno task cli ok passed here).
In Go:
- block, reset, cancel, wontfix (terminal phase in the spec file, global IDLE, spec.md and progress.json, a phase-change event), reopen, free and validate (exit 1 while blockers remain), at the top level and as spec <name> ...;
- review and delegate (approve blocks on pending delegations), plan-export (.claude/plan.md), split (--into or the detector), revisit, ac, task and note;
- events.jsonl (delegation created and answered, phase changes); the refinement split answer; next --validate and a manifest validate entry on aifx's providers;
- the legacy layout migration with its notice and the partial-migration error;
- -o json, markdown and text through a port of output/formatter.ts, including its JS edge cases.
Only watch, manager/mgr and web still forward (M5, TASK-266).
New goldens spec_states (69 steps), spec_execution (64), spec_split_answer (21), legacy_layout (8) and next_validation (30) pass; all 22 scenarios replay.
Go differs:
- free and validate print the manifest's prefix;
- the legacy layout moves at the start of lifecycle and state commands, not on the first state.json read; the Go hooks do not migrate;
- uncaught TS errors become 'noskills: <msg>', exit 1;
- the validator reads the spec document inside the project root only.
The server and bridge do not run the validator.
TS bugs are filed as a follow-up.
<!-- SECTION:NOTES:END -->
