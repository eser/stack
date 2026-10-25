---
id: TASK-324
title: >-
  Fix the TypeScript noskills lifecycle bugs found while porting the lifecycle
  to Go
status: Done
assignee: []
created_date: '2026-10-25 01:01'
updated_date: '2026-10-25 01:42'
labels:
  - noskills
  - bug
dependencies: []
priority: medium
ordinal: 327000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-258; the Go port copies some for parity. (1) commands/init.ts:38-43: stripModeFlag runs before the --non-interactive check, so only agent mode skips the prompts. (2) commands/init.ts:268: hasActiveSpecs reads .phase from {name, state} entries, so the onboarding banner always shows. (3) commands/spec.ts:503-511: with --from-plan the saved state is the one before recordTransition, so transitionHistory is missing (Go copies this). (4) spec/living.ts:523 and state/machine.ts:323: the completeness gate cannot pass through the CLI alone; the summary, premises, tasks and acceptance-criteria placeholders have no command to fill them or mark them N/A, so approving in DISCOVERY_REFINEMENT always throws. (5) noskills spec --help crashes (spec.ts:257). (6) ffi/go-noskills.ts:24,37,84,119 expects sessionId/name where bridge_noskills.go returns root/specName.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item has a failing test and is fixed in TS and Go, or documented as intended
- [x] #2 The golden lifecycle scenarios are re-recorded and pass against Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, each with a failing test first:
(1) commands/init.ts: --non-interactive is read before stripModeFlag (which removes it with the mode flags) and also sets the tui target. 'init --non-interactive --human' now asks nothing. Test: init.test.ts 'asks nothing with --non-interactive'.
(2) commands/init.ts: hasActiveSpecs checks s.state.phase over listSpecStates' {name, state} entries, so a re-init with an active spec prints 'Start a spec with' instead of the onboarding banner. Test: 'points at the active spec on a re-init' (with --human; without a terminal init answers for an agent).
(3) commands/spec.ts: with --from-plan, the saved state keeps the recorded IDLE->DISCOVERY transition. Fixed in Go too (noskillsfx/lifecycle_commands.go, which had copied it). Test: spec-plan.test.ts 'records the transition and the plan path'. The spec_new golden was re-recorded from TS and replays against Go.
(4) Not a bug fix: the completeness gate can't be passed from the CLI, because no command fills or marks N/A the sections that map to no discovery question. Filed as TASK-325 (needs a design and a Go port).
(5) commands/spec.ts: 'spec --help' and '-h' print the usage instead of looking for .eser/specs/--help. Test: spec.test.ts.
(6) go-noskills.ts (public export ./go-noskills): now uses the bridge's wire format. initNoskills({root}) returns {root}, newNoskillsSpec({root, description, specName?, planPath?}) returns {specName, specFile}, nextNoskillsStep({root, specName, answer?}). It used to send configDir and read sessionId/name, which the bridge never sent. New go-noskills.test.ts runs it against the native library. CHANGELOG Migration entry added.
The Go init copies (1) and (2) for parity; the TASK-259 agent, which owns cmd/noskills/init.go right now, was asked to mirror both and re-record the init goldens.
deno test pkg/@eserstack/noskills: 495 passed; lint and check clean. Closing waits on that Go change and a clean gate.

2026-10-25: rtk make ok and deno task cli ok passed with all agent work in place. The TASK-259 agent mirrored fixes (1) and (2) into cmd/noskills/init.go (init.go:330, hasActiveSpec at :589), re-recorded init_bare and init_tools, and added an init_active_spec scenario; all replay against Go. Item (4) moved to TASK-325.
<!-- SECTION:NOTES:END -->
