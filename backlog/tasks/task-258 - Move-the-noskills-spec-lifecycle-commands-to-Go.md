---
id: TASK-258
title: Move the noskills spec lifecycle commands to Go
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 01:01'
labels:
  - go
  - noskills
milestone: m-4
dependencies:
  - TASK-256
priority: high
ordinal: 258000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement init, spec new, next, status, approve and done on noskillsfx, including the TASK-166 discovery flow, and close the compiler, machine, schema and validation gaps from M4-T1.

Plan key: M4-T3. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Golden fixtures for the lifecycle pass
- [x] #2 noskills-server keeps using the same noskillsfx functions; `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent, checked here; make ok and deno task cli ok passed).
In Go on noskillsfx, run by cmd/noskills: init, spec new / list / --help / <name> (status, next, approve, done, followup), next with and without --answer (--agent/--human), status, approve, done, and session-start for every phase.
- The discovery flow covers listen, mode, premises, base questions together, follow-ups one at a time, alternatives, refinement with its review gate, and execution (verification, status reports).
- New files: lifecycle_*.go (state, machine, next, answers, commands, init, env, system, ledger), next_*.go (the compiler), living_spec.go, spec_document.go, split_detector.go, manifest_write.go, yaml_emit.go and js_value.go.
- The old compile.go, discovery.go and machine.go are replaced.
Still forwarded to TS: -o markdown/text (TASK-258.1); next --validate or a manifest with validate; the refinement split answer; and the spec subcommands block, reset, cancel, wontfix, reopen, review, delegate, learn, plan-export, ledger, split, revisit, ac, task and note. init writes .eser/ in Go and runs the TS init quietly for tool files until TASK-259.
AC #1: TestReplay passes spec_lifecycle (un-skipped), hooks, hook_events and purge_restore, plus new TS recordings lifecycle (51 steps), lifecycle_concerns (48), spec_new (20), init_tools and init_bare; sync stays skipped (TASK-259). lifecycle_concerns.json is 1.38 MB, over the repository's 1 MB per-file limit, so the harness now keeps a recording over 900 KB as name.json.gz (readRecording/writeRecording, gzip with a zero ModTime). The comparison is unchanged.
AC #2: noskills-server (specs.go rewritten, lifecycle_process.go) and the bridge (bridge_noskills.go, now !wasip1) call the same noskillsfx functions.
Server answers that changed because they were wrong:
- create initializes and answers {name, phase: DISCOVERY} with global IDLE and the spec on spec/<name>; a taken or invalid explicit name is 409 instead of an automatic suffix;
- list includes spec directories without a state file;
- next returns the CLI JSON (404 missing spec, 422 refused, 501 TS-only answer);
- approve without a phase move is 409 and no longer starts execution in SPEC_APPROVED;
- block only in EXECUTING.
Bridge: init no longer overwrites .gitignore and writes the TS manifest; spec new follows the TS rules; next returns the TS JSON and writes lastCalledAt.
OWNER DECISION: with the full lifecycle linked, the WASM profile grew to 9,688,823 / 1,884,236 bytes, over the 8,000,000 / 1,600,000 limits. The noskills names (noskillsInit, noskillsSpecNew, noskillsNext) were taken out of the profile, which is now 52 names (7,535,052 / 1,454,299), and they answer UNSUPPORTED_IN_WASM on the fallback. This walks back part of TASK-272's profile. To bring them back: raise the limits (owner approval), or link a smaller lifecycle subset into the WASM build.
Go behaviour that differs from TS:
- an error TS throws uncaught prints 'noskills: <msg>' and exit 1;
- spec names with path separators are refused;
- init rewrites only the noskills section of the manifest;
- listings are sorted;
- legacy top-level manifest keys are not read.
TS bugs found (not changed) are filed as a follow-up. Note: go-noskills.ts expects sessionId/name where the bridge returns root/specName; this predates the change.
<!-- SECTION:NOTES:END -->
