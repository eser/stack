---
id: TASK-215
title: 'shell: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test pkg/@eserstack/shell` passes, including both FFI suites on node:ffi
- [ ] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 27 files, 26 pass, 1 fail; 314 tests pass, 2 fail.
- Deno API in tests: env/executable.test.ts:29-83 (2 tests): Deno.makeTempDir, writeTextFile, chmod, mkdir, remove, and Deno.env.get/set("PATH") 6 times.
- Sanitizer options to remove: exec/command.ffi.test.ts 1, go-exec.ffi.test.ts 1.
- Source: Deno. 1 (a comment in tui/keypress.ts:190). The 4 local `const test = types.createTestContext()` in tui tests shadow the node:test import inside a closure only (harmless).
- Docs: pkg/@eserstack/shell/README.md (3, the Deno.errors.NotFound note at :653 and :664). pkg/ajan/shellfx is clean.
<!-- SECTION:NOTES:END -->
