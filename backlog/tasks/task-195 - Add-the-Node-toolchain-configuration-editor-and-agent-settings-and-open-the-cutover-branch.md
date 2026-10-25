---
id: TASK-195
title: >-
  Add the Node toolchain configuration, editor and agent settings, and open the
  cutover branch
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 07:56'
labels:
  - cutover
  - tooling
  - tsc
  - oxlint
  - oxfmt
  - devenv
milestone: m-1
dependencies:
  - TASK-174
  - TASK-175
  - TASK-176
  - TASK-177
  - TASK-178
  - TASK-179
  - TASK-181
  - TASK-182
  - TASK-187
  - TASK-191
  - TASK-186
  - TASK-185
  - TASK-194
priority: high
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The integration agent opens the cutover branch and applies the protocol from M0-T20: one worktree per agent, and only the integration agent edits pnpm-lock.yaml and the root package.json.
- Root devDependencies, pinned exactly: typescript@7.0.2, oxlint, oxlint-tsgolint, oxfmt, mitata.
- tsconfig.json: module and moduleResolution nodenext, noEmit, allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax, isolatedModules, resolveJsonModule (for the 31 `with { type: "json" }` imports, including cli/main.ts:28 and noskills/defaults/*/mod.ts), the existing strict flags, types [node] and jsx react-jsx. Include and exclude match the old deno.json excludes. No precompile, no jsxImportSource @eser, no deno.window. Collapse the laroux tsconfigs.
- Add .oxlintrc.json and .oxfmtrc.json from the M0-T2 drafts (printWidth 80, sortPackageJson off, ignorePatterns), and root scripts for lint, fmt, check, test and bench.
- .vscode: switch to the oxc extension and drop the deno.* keys.
- .mise.toml: drop deno and bun (bun = "1.3" at :7), and add pnpm; tasks call make or node.
- flake.nix devShell: drop deno and bun (:116).
- .agents/settings.json: replace the seven Bash(deno ...) entries with pnpm, node, oxlint, oxfmt and tsc.
- .agents/hooks/decision-nudge.js:37: name the new commands and fix the stale paths.
- Make validate-skills.ts run under node.

Decisions this task waits on: decision-1 (How agents commit and coordinate, from M0 on and while the gate is red inside M1); decision-2 (What the root package.json may carry); decision-6 (Give JSR consumers a signal before freezing it); decision-15 (Keep Bun support); decision-19 (oxfmt settings and the one-time reformat); decision-33 (Type checker and emitter); decision-34 (Rules oxlint does not cover).

Plan key: M1-T1. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `pnpm exec tsc --noEmit`, `pnpm exec oxlint` and `pnpm exec oxfmt --check` run with the new configs, JSON imports type-check, and the tsc error count per package is recorded
- [ ] #2 No tsconfig contains precompile, deno.window or jsxImportSource @eser
- [ ] #3 Recipes, dist, node_modules, etc/temp and backlog are ignored by oxlint and oxfmt
- [ ] #4 None of .vscode, .mise.toml, flake.nix devShell or .agents/settings.json mentions deno or bun; `node .agents/skills/eser-rules-manager/scripts/validate-skills.ts` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: not started by an agent. This is M1-T1: it opens the cutover branch, where the Deno gate goes red by design. Opening a branch needs git checkout, which agents may not run, and decision-1 (how agents commit while the gate is red) is the owner's.
<!-- SECTION:NOTES:END -->
