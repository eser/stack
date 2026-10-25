---
id: TASK-205
title: 'cli: remove deno compile and run the npm build under node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - cli
  - build
  - deno-removal
milestone: m-1
dependencies:
  - TASK-199
  - TASK-202
priority: high
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In cli/scripts/compile.ts, delete the deno compile path for the eser, noskills and laroux binaries: :359-371, :401-441, the .wasm.bin includes at :171-232, and Deno.build.target at :583-611. Keep the Go noskills-server loop, the Rust-triple archives and SHA256SUMS.txt, run under node, until M3-T10 replaces them. Run cli/scripts/npm-build.ts under node, and drop the npm:* and jsr:* externals. Delete startup.bench.ts and its code-conventions baseline entry. Port the cli tests, and remove the deno and bun install lines from the cli README.

Decisions this task waits on: decision-8 (What replaces deno compile for the eser, noskills and laroux binaries).

Plan key: M1-T11. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No `deno compile` and no Deno.* in pkg/@eserstack/cli
- [ ] #2 `node pkg/@eserstack/cli/scripts/npm-build.ts` builds a dist that runs `node dist/eser.js --help`
- [ ] #3 The noskills-server archives and SHA256SUMS.txt are still produced with v4.5.2 names
- [ ] #4 cli tests pass under node --test; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 5 files, 5 pass, 73 tests, 0 fail; startup.bench.ts became 5 skipped placeholders.
- Non-test source: Deno. 6 (scripts/compile.ts 4, :576 and :581 Deno.build.target; scripts.ts:331 Deno.build.standalone); Bun. 1 (scripts.ts); jsr: 1 and npm: 1 (scripts/npm-build.ts:135 externals "npm:*", "jsr:*"); scripts/compile.ts:415 the `deno compile` exec; commands/ajan.ts:52 detectRuntime() === "deno"; main.ts:52 devCommand "deno task cli" and main.ts:126 the deno-install notice; scripts.ts uses execPath() 11 times, 3 of them with "run".
- Docs: pkg/@eserstack/cli/README.md (9). No Go twin.
<!-- SECTION:NOTES:END -->
