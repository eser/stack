---
id: TASK-274
title: >-
  codebasefx and collectorfx: report an error for a walk root that cannot be
  read
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 16:36'
labels:
  - go
  - codebase
  - collector
  - bug
milestone: m-0
dependencies: []
priority: high
ordinal: 274000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/codebasefx/walker.go:112 and pkg/ajan/collectorfx/walker.go:70 return nil when the walk callback gets an error for the root itself. A root that does not exist or cannot be read therefore walks zero files without an error. Found by the WASM profile spike on 2026-10-23:
- On WASM without a preopen, codebaseValidateFiles reports every validator as passed with filesChecked 0, and @eserstack/codebase falls back to WASM silently on machines without the native library.
- Natively, a mistyped directory returns `{}` the same way.

Keep skipping unreadable entries below the root, which is the current intent, but return an error that names the root when the root fails. Rules: coding-practices (errors).

Plan key: M0-T24. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Go tests in codebasefx and collectorfx walk a missing root and get an error that names it
- [x] #2 A Go test walks a root with one unreadable subdirectory and still gets the readable files
- [x] #3 A bridge test calls codebaseValidateFiles on a missing root and gets error JSON, not a passing result
- [x] #4 `deno task cli go-ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the WalkDir callbacks in codebasefx/walker.go (walkViaFS) and collectorfx/walker.go returned nil for every error, including the one for the root. Both now return ErrUnreadableWalkRoot wrapped with the root path when the failing path is the root, and keep skipping unreadable entries below it. Tests: codebasefx_walker_test.go (missing root with GitAware false and true, unreadable subdirectory), collectorfx_walker_test.go (same), and TestBridgeCodebaseValidateFiles_MissingRoot in the bridge module. Full gate: deno task cli ok passed on 2026-10-24 (34 steps). (includes go-check, go-lint and the Go tests).
<!-- SECTION:NOTES:END -->
