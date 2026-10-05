---
id: TASK-48
title: Resolve or ticket the TODO and FIXME comments
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - hygiene
dependencies: []
references:
  - pkg/ajan/configfx/manager.go
  - pkg/@eserstack/laroux-runtime/primitives.ts
  - pkg/@eserstack/bundler/backends/deno-bundler.ts
priority: medium
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
16 TODO/FIXME comments in non-test code carry no backlog id, which workflow-practices forbids. Three describe live correctness gaps: pkg/ajan/configfx/manager.go:601 (field.Set without CanSet), pkg/@eserstack/laroux-runtime/primitives.ts:65 (unhandled promise error), pkg/@eserstack/bundler/backends/deno-bundler.ts:273 (catch {} swallows every error). The others: types/metric_int.go:138, httpfx/router.go:230, resolve_address_middleware.go:73, lib/env.go:9, lib/maps.go:6, logfx/handler.go:68, app-runtime/module.ts:6-11, laroux-react entry.tsx:151, deno-bundler.ts:129, cross-runtime/adapters/deno.ts:10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three correctness gaps are fixed with tests
- [x] #2 Every remaining TODO/FIXME names a backlog task or is removed
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

bundler: Bundler share is done and verified. The deno-bundler.ts:273 swallow-all catch is now resolveOutputScanDir, which falls back only on NotFoundError. It has four unit tests, including an injected-fs test that a non-NotFound error is rethrown, plus an integration test with the real Deno.bundle. The obsolete :129 TODO is removed: Deno.bundle has no define option, and define is applied after the build. The proxy-file read in findEntrypointChunks now catches only NotFoundError. No TODO or FIXME is left in pkg/@eserstack/bundler. The configfx manager.go:601 and laroux-runtime primitives.ts:65 gaps belong to other units.

small-b2: This unit's share is done and checked. The four TODO(@eser) comments in app-runtime/module.ts are replaced by JSDoc, and the typing work is proposed as a new task. The laroux-runtime FIXME (an unhandled rejection) is fixed with LarouxManifestLoadError and an immediately attached handler. I confirmed that primitives.test.ts guards the fix: with the `.catch` line removed, 10 tests fail. No TODO or FIXME remains in the unit's paths.

go-server: Verified: the TODOs at router.go:230 and resolve_address_middleware.go:73 are removed. A grep over all unit paths finds only TODO(TASK-55), in cmd/noskills-server/README.md. The three correctness gaps belong to other units.

go-libs-bridge: The configfx manager.go CanSet gap is fixed, with tests: ErrUnsettableConfigField, a pointer guard in LoadMeta, nil embedded pointers handled, and two discarded reflectMeta errors now returned. The FIXMEs in metric_int.go, env.go, maps.go and logfx handler.go are resolved, and so is the FIXME in handler_test.go. No TODO or FIXME is left in the unit's paths. The other sites belong to other units.

Orchestrator: the two TODO(TASK-NEW) placeholders now name TASK-81 and TASK-152.
<!-- SECTION:NOTES:END -->
