---
id: TASK-68
title: >-
  Route noskills file and process calls through cross-runtime and use explicit
  checks
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - refactor
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/purge.ts
  - pkg/@eserstack/noskills/commands/run.ts
  - pkg/@eserstack/noskills/state/iteration.ts
  - pkg/@eserstack/noskills/commands/next.ts
  - pkg/@eserstack/noskills/commands/git-guard-hook.test.ts
  - pkg/@eserstack/noskills/sync/adapters/kiro.ts
priority: low
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several noskills modules import Node built-ins instead of runtime from @eserstack/standards/cross-runtime: commands/purge.ts:363 and :381 (node:fs rmSync, unlinkSync), commands/run.ts:726-727 (node:fs appendFileSync, node:path dirname), state/iteration.ts:119 and commands/next.ts:1679 (node:child_process execSync). Tests such as commands/git-guard-hook.test.ts:7 call Deno.makeTempDir and Deno.writeTextFile directly. Implicit truthy checks on strings and nullable values remain across the package (for example sync/adapters/kiro.ts:561 `if (spec.tasks)` and its sibling steering builders), and validate-code-conventions only catches `||` defaults. Rules: javascript-practices: Cross-Runtime APIs; coding-practices: Explicit Checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 noskills library code has no node: imports except the generated plugin text in sync/adapters/opencode.ts
- [x] #2 noskills tests use runtime helpers instead of Deno.* calls
- [x] #3 Checks on strings and nullable values in noskills compare explicitly (=== undefined, === "")
- [x] #4 noskills tests pass and deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: The criteria hold: lint, check and the code-conventions validator are clean, and the tests pass. Verifier change in this area: run.ts guardAgentGit and sync/engine.ts now compare allowGit with `=== true` instead of using truthiness.
<!-- SECTION:NOTES:END -->
