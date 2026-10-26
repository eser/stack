---
id: TASK-323
title: Fix the TypeScript noskills hook bugs found while porting the hook path to Go
status: Done
assignee: []
created_date: '2026-10-24 23:23'
updated_date: '2026-10-25 01:01'
labels:
  - noskills
  - bug
dependencies: []
priority: medium
ordinal: 326000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-257. The Go port does each of these correctly; fix TS or document. (1) state/iteration.ts:222 concatenates a string iteration ('3' becomes '31'). (2) commands/invoke-hook.ts:293: one concern without reminders throws and drops all of that file's rules. (3) sync/engine.ts:78: one unreadable rule file silently ends the rules walk. (4) context/folder-rules.ts:48 reads .folder-rules.md outside the project for '..' paths. (5) state/iteration.ts:266 writes state.json non-atomically. (6) context/questions.ts:224 throws on an undefined specDescription. (7) state/iteration.ts:77 counts driverPid 0 as alive. (8) commands/invoke-hook.ts:952 crashes on an empty NOSKILLS_REAL_GIT. (9) context/compiler.ts:38 prints 'spec undefined' with no spec key. (10) commands/invoke-hook.ts:784 never shows the restart notice when the manifest has no maxIterationsBeforeRestart.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item has a failing test first and is fixed, or is documented as intended
- [x] #2 The golden hook fixtures still pass against TS and Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, each item with a failing test first:
(1) state/iteration.ts: a stored iteration that is not a finite number counts as 0 ('3' no longer becomes '31'). Test 'a non-number iteration counts as 0'.
(2) context/concerns.ts getTier2RemindersForFile: a concern without reminders adds none. Before, it threw, and the hook's catch dropped every rule of the file. Test in concerns.test.ts.
(3) sync/engine.ts loadScopedRules: an unreadable rule file is skipped and the walk continues. Test with a stubbed read.
(4) context/folder-rules.ts: '.' and '..' are resolved before the walk; a path that leaves the project reads only the root's rules. New context/folder-rules.test.ts.
(5) state/iteration.ts: both state.json writes (recordIteration, setDriver) use persistence.writeTextFileAtomic, now exported. Test: a stub that fails any in-place write of state.json.
(6) context/questions.ts discoveryStageOf: a state without specDescription reads as no description. Before, it threw.
(7) state/iteration.ts isDriverAuthoritative: a driverPid that is not a positive integer is no live driver; kill(0) signalled our own process group.
(8) commands/invoke-hook.ts git-exec: an empty NOSKILLS_REAL_GIT means unset and resolves git from PATH (new hookDecisions.explicitRealGit).
(9) context/compiler.ts: a state with no spec key no longer prints 'spec undefined ...'.
(10) commands/invoke-hook.ts Stop: the restart threshold comes from the new hookDecisions.restartThreshold, which defaults to 15 when the manifest lacks the setting or holds a non-positive or non-integer value. Before, undefined was passed and the notice never showed.
deno test pkg/@eserstack/noskills: 492 passed; deno lint clean.
AC #2: the hooks and hook_events goldens were re-recorded from the TS CLI with these fixes (NOSKILLS_GOLDEN_RECORD=1, scenarios hooks,hook_events) and are byte-identical to the stored ones; go test ./pkg/ajan/noskillsfx/... ./cmd/noskills/... replays them against Go. Closing waits on a clean full gate (concurrent TASK-258 and TASK-264 work).

2026-10-25: make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
