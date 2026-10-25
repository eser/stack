---
id: TASK-195
title: >-
  Add the Node toolchain configuration, editor and agent settings, and open the
  cutover branch
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 12:00'
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
- [x] #1 `pnpm exec tsc --noEmit`, `pnpm exec oxlint` and `pnpm exec oxfmt --check` run with the new configs, JSON imports type-check, and the tsc error count per package is recorded
- [x] #2 No tsconfig contains precompile, deno.window or jsxImportSource @eser
- [x] #3 Recipes, dist, node_modules, etc/temp and backlog are ignored by oxlint and oxfmt
- [x] #4 None of .vscode, .mise.toml, flake.nix devShell or .agents/settings.json mentions deno or bun; `node .agents/skills/eser-rules-manager/scripts/validate-skills.ts` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, on the cutover branch, Node v26.12.1, pnpm 11.18.0.

Changes:
- Root devDependencies, exact: typescript 7.0.2, oxlint 1.89.0, oxlint-tsgolint 7.0.2004 (oxlint 1.89.0 declares the peer `>=7.0.2003`; 7.0.2004 is the last release before it), oxfmt 0.73.0; mitata 1.0.34, oxc-parser, @types/node and @eserstack/test-kit stay. Nothing outside decision-2's list was added.
- tsconfig.json: the M0-T2 draft with types [node] only, plus isolatedModules and jsx react-jsx. Include is `**/*.ts`, `**/*.tsx` and `.agents/**/*.ts` (tsc skips dot directories otherwise); exclude is the old deno.json exclude list. The three laroux tsconfig.json files are deleted; the root lib (esnext, dom) covers laroux-react.
- .oxlintrc.json and .oxfmtrc.json from the M0-T2 drafts, with `etc/codemods/` (deno.json excluded it), `node_modules/` and a generic `dist/` in ignorePatterns. The Deno and Bun globals in .oxlintrc.json stay until TASK-231.
- package.json scripts: check (`tsc --noEmit`), lint (`oxlint`), fmt (`oxfmt`), test (`node --test --test-force-exit` over `pkg/**/*.test.ts` and `etc/scripts/**/*.test.ts`), bench (runs each `*.bench.ts` under pkg/@eserstack with node). cli, laroux-cli and noskills-cli still call deno: under node the CLI prints help, but `codebase validate-licenses` ignores the manifest excludes, so the switch waits for TASK-199.
- .vscode recommends oxc.oxc-vscode and uses it as the formatter; no deno.* keys. No `typescript.tsdk`: TS 7 ships no tsserver.
- .mise.toml: deno and bun out, pnpm 11.18.0 in; test-ffi runs `node ./pkg/@eserstack/cli/main.ts ajan version` (the old `deno task cli go version` named a subcommand that no longer exists). flake.nix devShell: deno and bun out, the release packages unchanged.
- .agents/settings.json: the seven `Bash(deno ...)` entries became node, oxfmt, oxlint, tsc, `pnpm exec` for tsc, oxlint and oxfmt, and `pnpm` bench, check, cli, fmt, lint, run and test.
- decision-nudge.js names `pnpm fmt`, `pnpm lint`, `pnpm check` and `make fix` at the root, and points ADRs to docs/adr/ (it said apps/services and etc/adrs/).
- validate-skills.ts already ran on node; its header no longer offers `deno run`.

Checks:
- `pnpm exec tsc --noEmit`: 1,406 source files, exit 1, 3,044 errors. 2,901 are `Cannot find name/namespace 'Deno'`; the other 143 are TS90xx isolatedDeclarations 83, TS7006 32, TS2339 14 (`ReadableStream.from`, WalkEntry), TS7016 5 (lodash benches), TS1294 4, TS2307 3 (bun:ffi, the ffi-client template), TS7031 1, TS2534 1. No JSON import error (TS1543, TS2732) in the 13 files with `with { type: "json" }`.
- `pnpm exec oxlint`: runs with the config, 793 findings (no-explicit-any 300, no-await-in-loop 232, no-console 143, no-top-level-await 77, others 41), nearly all from deno-lint pragmas oxlint does not read (TASK-197).
- `pnpm exec oxfmt --check`: runs on 1,845 files, 875 not formatted (TASK-196).
- Ignore patterns: probe files in backlog/, .eser/recipes/, pkg/@eserstack/fp/dist/, etc/temp/ and node_modules/ were not reported by oxlint or oxfmt; a control file in pkg/@eserstack/fp was. The probes were deleted.
- No tsconfig in the repo contains precompile or deno.window. The only jsxImportSource left is in the recipe tsconfigs: `@eserstack/jsx-runtime` in .eser/recipes/jsx-runtime-app (removed with the recipe in TASK-210) and `react` in laroux-app.
- `grep -i -E 'deno|bun'` finds nothing in .vscode/, .mise.toml, .agents/settings.json or the flake.nix devShell. `node .agents/skills/eser-rules-manager/scripts/validate-skills.ts`: 14 skills, 0 errors, 0 warnings.
- `pnpm test` finds 435 test files; all fail on Deno.test until TASK-198.

tsc errors per package (all / without the Deno names):

| package | all | other |
| --- | --- | --- |
| standards | 571 | 34 |
| bundler | 220 | 5 |
| fp | 199 | 5 |
| shell | 154 | 1 |
| ajan | 153 | 3 |
| codebase | 138 | 2 |
| kit | 130 | 15 |
| primitives | 115 | 0 |
| laroux-server | 109 | 8 |
| streams | 106 | 1 |
| ai | 79 | 0 |
| mux | 72 | 0 |
| functions | 71 | 0 |
| noskills-client | 66 | 0 |
| laroux-react | 64 | 0 |
| laroux-bundler | 60 | 22 |
| noskills | 56 | 7 |
| laroux | 55 | 0 |
| posts | 52 | 18 |
| cs | 48 | 0 |
| http | 46 | 0 |
| di | 41 | 0 |
| logging | 40 | 0 |
| workflows | 40 | 0 |
| cli | 37 | 1 |
| noskills-web | 36 | 1 |
| etc/scripts | 34 | 3 |
| pkg/ajan/noskillsserverfx (a TS test) | 28 | 4 |
| crypto | 27 | 0 |
| testing | 24 | 0 |
| jsx-runtime | 22 | 4 |
| agents | 21 | 0 |
| cache | 20 | 0 |
| parsing | 20 | 0 |
| app-runtime | 14 | 4 |
| collector | 13 | 3 |
| config | 13 | 2 |
| laroux-runtime | 12 | 0 |
| events | 11 | 0 |
| webtransport | 11 | 0 |
| test-kit | 8 | 0 |
| formats | 7 | 0 |
| httpclient | 1 | 0 |
| total | 3,044 | 143 |

The six ajan-* platform packages, directives and .agents have 0.

Left for later: the reformat (TASK-196), the pragma codemod (TASK-197), the test and bench codemods (TASK-198), the CLI scripts on node (TASK-199), the precommit and preflight workflows (TASK-200), the emit tsconfig.build.json (TASK-232), and removing the Deno and Bun globals (TASK-231).
<!-- SECTION:NOTES:END -->
