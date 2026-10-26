---
id: TASK-217
title: 'ai: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - ai
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the Deno.env.set calls in ai/adapters/factory-fallback.test.ts and the windows `skip` conditions. Run the cli-shared and claude-code FFI suites on node:ffi. Update the deno mention in the Go twin test pkg/ajan/aifx/adapter_acp_test.go.

Plan key: M1-T23. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test pkg/@eserstack/ai` passes
- [x] #2 No Deno reference remains in pkg/@eserstack/ai or pkg/ajan/aifx; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 22 files, 22 pass, 264 tests, 0 fail. adapters/factory-fallback.test.ts mentions Deno.env.set only in a comment (:13). The windows `ignore:` conditions became `skip:` and run (cli-shared.ffi 2, claude-code.ffi 1). The FFI suites pass through the koffi backend; re-run them once node:ffi lands (TASK-202).
- Sanitizer options to remove: cli-shared.ffi 2, claude-code.ffi 1.
- Source: Deno. 1 (a comment in adapters/mod.ts:135). Go: pkg/ajan/aifx/adapter_acp_test.go (1). Docs: pkg/@eserstack/ai/README.md (4).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-217 (2026-10-26, node 26.12.1):
- `node --test pkg/@eserstack/ai`: 22 files, 264 tests, 0 fail, exits 0 without `--test-force-exit` (6 of 6 runs). The cli-shared and claude-code FFI suites run on node:ffi (the ExperimentalWarning shows it); no sanitizer or `ignore:` options were left.
- Deno references removed from pkg/@eserstack/ai: comments in adapters/mod.ts, adapters/ajan-bridge.ts (now states that node:ffi calls block until the decision-37 worker threads, M2-T8), adapters/ajan-bridge.test.ts and adapters/factory-fallback.test.ts; the "Deno workspaces" fixture became "pnpm workspaces" in claude-code.test.ts, claude-code.ffi.test.ts and README.md; the README and main.ts CLI usage is now `node ./main.ts`.
- tsc reports nothing under pkg/@eserstack/ai; oxlint and oxfmt --check are clean.
- Open for AC #2: pkg/ajan/aifx/adapter_acp_test.go:51 still holds `{"title":"Deno workspaces"}`; change it to `{"title":"pnpm workspaces"}` to match the TypeScript twin. It was left out of this pass to stay clear of TASK-279.
- Under `--test-force-exit` on macOS, 4 of 20 multi-file runs reported fewer tests than exist (242 to 248 of 264) with 0 fail: reports from one file's child process were dropped, probably stdout pipe writes lost at the forced exit. Single-file runs and runs without the flag always report 264.
The integration agent changed fakeStructuredReply in pkg/ajan/aifx/adapter_acp_test.go to "pnpm workspaces" to match the TypeScript test data (go test of the ACP tests passes), so AC #2 holds.
<!-- SECTION:NOTES:END -->
