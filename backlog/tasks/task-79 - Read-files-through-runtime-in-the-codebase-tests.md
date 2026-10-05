---
id: TASK-79
title: Read files through runtime in the codebase tests
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - codebase
  - test
dependencies: []
references:
  - pkg/@eserstack/codebase/ajan-ffi-parity.test.ts
  - pkg/@eserstack/codebase/changelog-text.test.ts
  - pkg/@eserstack/codebase/release-contract.test.ts
priority: low
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ajan-ffi-parity.test.ts:31, changelog-text.test.ts:15, :22, :37 and release-contract.test.ts:32 read files with Deno.readTextFile, which the manifest exempts for tests. The testing rule asks tests that touch files to go through runtime from @eserstack/standards/cross-runtime. Rule: javascript-practices: Test Files and Runner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three tests use runtime.fs.readTextFile with paths built from import.meta.dirname
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

codebase: ajan-ffi-parity.test.ts, changelog-text.test.ts and release-contract.test.ts build their paths from import.meta.dirname with runtime.path and read with runtime.fs.readTextFile. The only remaining Deno.* calls in them are Deno.test.
<!-- SECTION:NOTES:END -->
