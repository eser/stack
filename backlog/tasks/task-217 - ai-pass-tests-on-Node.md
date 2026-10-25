---
id: TASK-217
title: 'ai: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test pkg/@eserstack/ai` passes
- [ ] #2 No Deno reference remains in pkg/@eserstack/ai or pkg/ajan/aifx; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 22 files, 22 pass, 264 tests, 0 fail. adapters/factory-fallback.test.ts mentions Deno.env.set only in a comment (:13). The windows `ignore:` conditions became `skip:` and run (cli-shared.ffi 2, claude-code.ffi 1). The FFI suites pass through the koffi backend; re-run them once node:ffi lands (TASK-202).
- Sanitizer options to remove: cli-shared.ffi 2, claude-code.ffi 1.
- Source: Deno. 1 (a comment in adapters/mod.ts:135). Go: pkg/ajan/aifx/adapter_acp_test.go (1). Docs: pkg/@eserstack/ai/README.md (4).
<!-- SECTION:NOTES:END -->
