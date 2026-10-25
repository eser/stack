---
id: TASK-211
title: 'noskills: pass the 72 test files on Node and stop generating deno commands'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 12:00'
labels:
  - cutover
  - noskills
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: high
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Test and command changes:
- Replace the `execPath() run --allow-all` spawns with `process.execPath, [file]` in the git-wrapper, init, invoke-hook and spec tests and in sync/adapters/opencode.test.ts.
- Update the generated hook commands, rule files and generated prompts so they no longer contain `deno run` or --allow-*. The default hook command stays `npx eser@latest noskills` until M4, and M3-T11 keeps it working.
- Remove the sanitizer assumptions in the purge, plan-export and validate tests.
- Run scripts/npm-build.ts under node.
- Update README and README-HOW: remove 'Use Deno for all TypeScript' and the verifyCommand `deno test`.
- In the Go twin, update pkg/ajan/noskillsfx/persistence.go:259 (cites `deno task cli ok`) and the deno mentions in compiler_test.go and manifest_preservation_test.go.
Per decision user-deno-projects, keep and allowlist the features that support users' own Deno projects: detect/codebase.ts:47, :127-128, sync/hook-commands.ts:134-180 (`deno run` and `deno x` network commands), and the framework mentions in defaults/concerns/007-well-engineered.json:85 and 013-ship-ready.json:26. If the owner drops that support, delete them here instead.

Decisions this task waits on: decision-12 (Keep supporting users whose own projects use Deno).

Plan key: M1-T17. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test 'pkg/@eserstack/noskills/**/*.test.ts'` passes
- [x] #2 Generated hook commands and fixtures contain no `deno run` or --allow-*
- [x] #3 `git grep -wni deno pkg/@eserstack/noskills pkg/ajan/noskillsfx` matches only the ADR 0005 allowlist paths; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 72 files, 66 pass, 6 fail; 1799 tests pass, 16 fail.
- `execPath() run --allow-all` spawns (node takes `run` as a script: "Cannot find module .../run"): commands/git-wrapper.test.ts (6 tests; its :234-236 program string is also Deno code, `new Deno.Command("git")...Deno.exit`), commands/invoke-hook.test.ts:491 runPreToolUseHook (4), commands/spec.test.ts:95 (3), commands/init.test.ts (1), sync/adapters/opencode.test.ts:911 (1).
- Adapter semantics: commands/next.test.ts:1699 expects "did not finish within 0.3", but the Node spawn rejects on abort (TASK-201, adapters/node.ts:83); fix in standards or catch in commands/next.ts:1756.
- Sanitizers: no test depended on them (purge, plan-export, validate pass). Options to remove: purge 6, plan-export 4, validate 4, plus `permissions:` 1.
- Generated text with `deno run`, `deno task` or `--allow-*`: output/cmd.ts:17,39 (devCommand "deno task cli"), main.ts:14-15, scripts/npm-build.ts:16, commands/git-wrapper.ts:235, sync/adapters/shared/agent-prompts.ts:7; keep and allowlist sync/hook-commands.ts:141. 13 test files hold `deno run|test|task` or `--allow-` strings.
- Source: Deno. 1 (a comment in commands/git-wrapper-install.ts:16); jsr: 2 and npm: 2 (sync/hook-commands.ts, scripts/npm-build.ts:126); import.meta.main 5 needs no change.
- Go: pkg/ajan/noskillsfx/persistence.go (1), compiler_test.go (1), manifest_preservation_test.go (5).
- Docs and data: README.md (3), README-HOW.md (4, at :711 and :894 `verifyCommand: "deno test"`), defaults/concerns/007-well-engineered.json (1) and 013-ship-ready.json (1), both kept per decision-12.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/noskills/commands/git-wrapper.test.ts: 6 failing, 22 passing; first error: AssertionError: Expected actual: "node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/init.test.ts: 3 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/invoke-hook.test.ts: 4 failing, 62 passing; first error: AssertionError: Values are not equal: an Edit that sets allowGit
- pkg/@eserstack/noskills/commands/next.test.ts: 1 failing, 61 passing; first error: AssertionError: Expected actual: "Verification command failed to execute: The operation was aborted" to contain: "did n
- pkg/@eserstack/noskills/commands/run-loop.test.ts: 4 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/session-config-diagrams.test.ts: 10 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/spec-plan.test.ts: 1 failing, 9 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/spec-section.test.ts: 9 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/spec-states.test.ts: 5 failing, 1 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/commands/spec.test.ts: 4 failing, 0 passing; first error: SyntaxError [Error]: Unexpected end of JSON input
- pkg/@eserstack/noskills/commands/state-commands.test.ts: 3 failing, 0 passing; first error: AssertionError: Values are not equal: node:internal/modules/cjs/loader:1607
- pkg/@eserstack/noskills/state/persistence.migration.test.ts: 1 failing, 11 passing; first error: Error [ERR_FS_EISDIR]: Path is a directory: rm returned EISDIR (is a directory) <tmp> { code: 'ERR_FS_EISDIR', info: { c
- pkg/@eserstack/noskills/sync/adapters/opencode.test.ts: 1 failing, 35 passing; first error: AssertionError: Expected error message to include "Git write operations are not allowed", but got "noskills: the PreToo
TASK-211 work (2026-10-26, node 26.12.1):
- Test spawns: every `execPath() run -A --config deno.json main.ts` became `execPath() main.ts` (git-wrapper, init, invoke-hook, run-loop, session-config-diagrams, spec, spec-plan, spec-section, spec-states, state-commands, opencode tests). The git-wrapper interpreter program is now `node -e` with `child_process.spawnSync`.
- Bug fixed test-first: Node's `fs.rm` refuses an empty folder without `recursive`, so purge left empty tool folders (new purge test "removes the tool folders purge left empty") and the legacy-layout migration threw EISDIR. purge.ts checks emptiness, then removes with `recursive`; persistence.ts removes the proven-empty folder with `recursive`.
- next.test.ts already passed (TASK-201 fixed the aborted spawn).
- Generated text: output/cmd.ts devCommand is `pnpm cli` and jsrPackage is gone; the init network warning no longer offers `deno install -g -A`; the git wrapper comment says `pnpm run`; the rule example is `Use node:test for all tests` (also cmd/noskills/state_commands.go and the state_commands golden). The Deno-only `NotFound` name check in persistence.ts is gone.
- Fixtures: `testRunner: "node"`, `pnpm cli noskills` and `node ./tools/nos.ts` replace the deno forms; hook-commands.test.ts keeps the Deno network-runner cases without `--allow-*`. The sanitizer comment in purge.test.ts is gone; no other sanitizer assumption was left.
- scripts/npm-build.ts runs under node; the `npm:*`/`jsr:*` externals are dropped. READMEs and README-HOW updated. cmd/noskills run_binary_test.go parity runs node (passes with NOSKILLS_RUN_PARITY=1).
- tsc: seven TS9010 isolatedDeclarations errors fixed with explicit types. oxlint and oxfmt clean. node --test: 81 files, 1918 tests pass, each file alone too. Go: cmd/noskills and pkg/ajan/noskillsfx tests pass.
- AC #3 open: outside the ADR 0005 allowlist, pkg/@eserstack/noskills keeps context/compiler.ts (version-term regex naming Deno), sync/adapters/shared/agent-prompts.ts (`deno.json tasks` hint for users' projects) and sync/hook-commands.test.ts (tests of the allowlisted recognizer); they need ADR entries or removal. pkg/ajan/noskillsfx still has 24 files / 267 lines: goldens recorded with a `deno task cli noskills` prefix, git_wrapper.go:272, hook_commands.go:224 (now differs from TS), sync_claude.go:33, lifecycle_init.go, next_discovery.go, learnings_test.go, hook_parity_test.go (deno fmt) and testdata/hook_parity.json. The persistence.go, compiler_test.go and manifest_preservation_test.go mentions this description names are already gone.
TASK-211 AC #3 (2026-10-26, node 26.12.1):
- Go twin: git_wrapper.go says `(pnpm run does)`, hook_commands.go drops the `deno install` offer, the sync_adapters golden case uses the `pnpm cli noskills` prefix, and learnings_test.go slugs "Use Node Tests".
- Goldens re-recorded from the TypeScript CLI on node (NOSKILLS_GOLDEN_RECORD=1 go test -run 'TestRecord$|TestSyncAdaptersMatchTypeScript' ./pkg/ajan/noskillsfx/golden/) and the hook parity recording with NOSKILLS_PARITY_RECORD=1. The parity recorder now formats with the repository's oxfmt (it skips testdata/, so it formats a temporary copy with .oxfmtrc.json) instead of deno fmt; the output equals the old deno fmt layout. The recorder moved to hook_parity_record_test.go.
- Bug fixed test-first: under node, provider detection sometimes outlasts one spinner interval, so two recordings of the lifecycle scenario differed by a spinner frame. normalize() drops spinner frames (golden/normalize_test.go).
- ADR 0005 Appendix B now lists the Go twins and compiler.ts, agent-prompts.ts/sync_claude.go, hook-commands.test.ts, the parity corpus and recording, and golden/testdata/golden/ (its only Deno mention is the `deno.json tasks` hint of the generated agents). The AC #3 grep matches only those paths.
- Checks: go vet, go test (noskillsfx, golden, cmd/noskills), golangci-lint (0 issues), node --test (1918 pass), tsc and oxlint clean.
<!-- SECTION:NOTES:END -->
