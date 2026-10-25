---
id: TASK-199
title: Start the eser CLI with node
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
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
- [ ] #1 `pnpm cli --help`, `pnpm cli ajan version` and `pnpm cli codebase validate-eof` run on the pinned Node minor (26.9 or later) with no FFI flag
- [ ] #2 No Deno reference in cli/main.ts, cli/scripts.ts, cli/commands/ajan.ts or the codebase hook body
- [ ] #3 Hooks are not reinstalled until M1-T37
<!-- AC:END -->
