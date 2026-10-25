---
id: TASK-215
title: 'shell: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - shell
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port shell/env/executable.test.ts (Deno.env.set, makeTempDir and chmod become process.env and node:fs) and the other hand-edit files. Remove the Deno.errors.NotFound migration note from README.md:653 and :664.

Plan key: M1-T21. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test pkg/@eserstack/shell` passes, including both FFI suites on node:ffi
- [x] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 27 files, 26 pass, 1 fail; 314 tests pass, 2 fail.
- Deno API in tests: env/executable.test.ts:29-83 (2 tests): Deno.makeTempDir, writeTextFile, chmod, mkdir, remove, and Deno.env.get/set("PATH") 6 times.
- Sanitizer options to remove: exec/command.ffi.test.ts 1, go-exec.ffi.test.ts 1.
- Source: Deno. 1 (a comment in tui/keypress.ts:190). The 4 local `const test = types.createTestContext()` in tui tests shadow the node:test import inside a closure only (harmless).
- Docs: pkg/@eserstack/shell/README.md (3, the Deno.errors.NotFound note at :653 and :664). pkg/ajan/shellfx is clean.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/shell/env/executable.test.ts: 2 failing, 2 passing; first error: see the run

2026-10-26 (TASK-215 implementation):
- env/executable.test.ts uses node:fs/promises (mkdtemp, writeFile, chmod, mkdir, rm) and process.env["PATH"] in place of the Deno APIs.
- exec/exec-go.ts: DEFAULT_TIMEOUT_MS has an explicit number type (the only isolatedDeclarations error left after TASK-198 and TASK-202).
- The ffiTest wrappers in go-exec.ffi.test.ts and exec/command.ffi.test.ts were plain nodeTest.test calls after the sanitizer options went; the tests call nodeTest.test directly.
- Comments: keypress.ts, exec/types.ts, exec/command.ts and env/executable.ts no longer name Deno or Bun. pty-go.ts now states that the node:ffi PTY read is synchronous and parks the event loop while a PTY is idle, until the decision-37 worker thread (M2-T8). The stale deno-doc-ignore pragma in args/types.ts is gone. The child() examples pipe into `cat` instead of `deno fmt -`.
- README: the runtime bullet names Node.js only; the 4.x upgrade note mentions only Node's ENOENT.
- vterm/terminal.ts keeps its default import: Node exposes the CommonJS @xterm/headless only on default, and its typings declare no default on the namespace, so the namespace-import baseline entry stays.
- Verified on Node 26.12.1: `node --test --test-force-exit 'pkg/@eserstack/shell/**/*.test.ts'` 316 pass, 0 fail (both FFI suites: 8 pass on node:ffi); tsc reports no error under pkg/@eserstack/shell; oxlint and oxfmt --check clean; `git grep -wn 'Deno\|Bun\|deno' -- pkg/@eserstack/shell` is empty.
<!-- SECTION:NOTES:END -->
