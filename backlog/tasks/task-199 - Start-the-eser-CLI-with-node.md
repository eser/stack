---
id: TASK-199
title: Start the eser CLI with node
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - cli
  - codebase
milestone: m-1
dependencies:
  - TASK-198
priority: high
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cross-package: cli and codebase.
- Root package.json (integration agent): change the cli, laroux-cli and noskills-cli scripts to `node ./pkg/@eserstack/<x>/main.ts`.
- Set devCommand to `pnpm cli` in cli/main.ts:51, codebase/install.ts:46 (the git hook body) and codebase/cli-system/app.ts:37.
- cli/scripts.ts:288-331: map the dev invoker to `<node> <main.ts>`, and delete the deno invoker branch and the Deno.build.standalone check.
- Remove the deno hint in cli/commands/ajan.ts:52.

Decisions this task waits on: decision-20 (The documented command form for the gate and scripts); decision-24 (When the gate runner moves to Go).

Plan key: M1-T5. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm cli --help`, `pnpm cli ajan version` and `pnpm cli codebase validate-eof` run on the pinned Node minor (26.9 or later) with no FFI flag
- [x] #2 No Deno reference in cli/main.ts, cli/scripts.ts, cli/commands/ajan.ts or the codebase hook body
- [x] #3 Hooks are not reinstalled until M1-T37
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- devCommand is `pnpm cli` in cli/main.ts, codebase/install.ts and codebase/cli-system/app.ts (`pnpm cli <command>`); cli-system/layer.test.ts uses the same form.
- cli/scripts.ts: the dev invoker builds `'<node>' '<main.ts>'`; the deno branch and the Deno.build.standalone check are gone. The switch ends in a default that returns the `eser` on PATH, so it compiles before and after TASK-201 drops the deno, bun and bunx invokers; bun and bunx now take that default. The error hint and doc examples say `pnpm test`.
- cli/commands/ajan.ts prints only the optional-dependency hint and no longer imports cross-runtime; `ajanCommand` got an explicit type for isolatedDeclarations (TS9010).
- cli/main.ts: the usage line and the JSR notice comment no longer name Deno.
- AC #1 on Node 26.12.1, no FFI flag: `pnpm cli --help` exits 0; `pnpm cli ajan version` prints `eser-ajan version 4.5.2`; `pnpm cli codebase validate-eof --exclude docs/api/ --exclude third-party/` (the manifest excludes) checks 3250 files with no issues. Without the excludes it reports three third-party/jsonschema files, which the manifest keeps out on purpose.
- Tests: scripts.test.ts, main.test.ts and cli-system/layer.test.ts pass under `node --test` (63 tests); tsc shows no errors and oxlint and oxfmt are clean for the changed files.
- AC #3: `eser codebase install` was not run, and .git/hooks is unchanged.
- Open for standards (TASK-201): under Node, detectInvoker never reports `dev`, so `pnpm cli` is detected as pnpx and detectExecutionContext returns `pnpx eser`. A hook installed now would run `pnpx eser`, not the devCommand; M1-T37 needs Node dev detection before it reinstalls hooks.
<!-- SECTION:NOTES:END -->
