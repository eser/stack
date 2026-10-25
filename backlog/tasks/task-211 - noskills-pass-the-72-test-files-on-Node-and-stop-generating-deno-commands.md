---
id: TASK-211
title: 'noskills: pass the 72 test files on Node and stop generating deno commands'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test 'pkg/@eserstack/noskills/**/*.test.ts'` passes
- [ ] #2 Generated hook commands and fixtures contain no `deno run` or --allow-*
- [ ] #3 `git grep -wni deno pkg/@eserstack/noskills pkg/ajan/noskillsfx` matches only the ADR 0005 allowlist paths; tsc and oxlint are clean
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
<!-- SECTION:NOTES:END -->
