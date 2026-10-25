---
id: TASK-202
title: 'ajan: run the FFI bridge on Node only through node:ffi'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - ajan
  - ffi
  - deno-removal
milestone: m-1
dependencies:
  - TASK-198
  - TASK-189
  - TASK-273
priority: high
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decisions ffi-on-node and wasm-fallback, the bridge has one loader order on Node: the built-in node:ffi module (on by default since Node 26.9) first; if it cannot load, the WASM build (WASI); if that fails too, a clear error and exit. Nothing else, and koffi is not a fallback. Calls stay synchronous on the existing 100 exports through the cutover; M2-T7 replaces them with the dispatcher and M2-T8 moves blocking calls to worker threads. M0-T13 already moved the open path in ffi/backend-node.ts to node:ffi for its CI job; this task finishes that backend and deletes the rest.

Changes in ajan:
- Delete ffi/backend-deno.ts and backend-bun.ts, and finish ffi/backend-node.ts on node:ffi with no koffi code left: `dlopen` with the symbol map, string arguments, returned strings read the way M0-T2 recorded and released with `EserAjanFree`, and `close` on unload.
- Collapse the backend registry and detectRuntime (mod.ts:155-187) into that loader order. Fix the error texts at mod.ts:8 and :216-221 so they name node:ffi, the Node 26.9 floor, `--allow-ffi` under the permission model, `--no-experimental-ffi` as the switch that turns it off, ESER_AJAN_LIB_PATH, and that the WASM fallback also failed to load.
- In resolve.ts, replace the Deno probes (:34-38, :77-80, :113-119) with process.platform, process.arch and fs.statSync.
- Drop the .wasm.bin handling in wasm/resolve.ts:61, which existed only for deno compile. The WASM fallback stays as the TASK-273 reactor (decision-45); command mode is already gone.
- Rename the denoTarget field in targets.ts to releaseTriple, keeping the triple strings, and update its callers in cli and codebase (cross-package note).
- Fix the description in npm/root-package.json:4 ('cross-runtime (Node.js, Bun, Deno)'), and update examples/browser/README.md, index.html and the ajan README.

koffi leaves the tree (cross-package notes, one commit per package; the integration agent makes the pnpm-workspace.yaml and lockfile changes):
- the koffi dependency in ajan/package.json
- the koffi pin in cli/scripts/npm-build.ts:177 and the koffi entry in cli/scripts/npm-build-externals.test.ts
- the koffi entry in codebase/npm-externals.ts and the fixtures in codebase/npm-workspace-specifiers.test.ts
- the koffi allowBuilds entry in pnpm-workspace.yaml
- the koffi comments in etc/scripts/preflight-npm-consumer.ts and .github/workflows/build.yml:583, and the koffi entries in TODOS.md
The ajan-* platform packages keep only the Go shared library.

Port mod.test.ts:120-143 to spawn process.execPath, and change codebase/ajan-ffi-parity.test.ts to compare main.go, types.ts and the node:ffi symbol map in backend-node.ts.

Decisions this task waits on: decision-14 (Minimum Node.js version); decision-15 (Keep Bun support); decision-37 (FFI mechanism on Node); decision-38 (Release archive names); decision-45 (ajan WASM fallback).

Plan key: M1-T8. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -niw -e deno -e bun -e koffi -- 'pkg/@eserstack/ajan/*.ts' 'pkg/@eserstack/ajan/*.json' 'pkg/@eserstack/ajan/*.html' 'pkg/@eserstack/ajan/*.md'` returns nothing
- [ ] #2 `git grep -n -w -i koffi` matches only the history files on the ADR 0005 allowlist (CHANGELOG.md, backlog/, security-report.md), and pnpm-lock.yaml has no koffi entry
- [ ] #3 ffi/backend-node.ts imports node:ffi, and the seven *.ffi.test.ts suites pass under `node --test` with no FFI flag on the pinned Node 26 minor in CI on macOS arm64 and Linux arm64
- [ ] #4 A test starts Node with `--no-experimental-ffi` and checks that the loader falls back to the WASM build and a dispatcher call through the reactor instance succeeds; a second test also makes the WASM build unavailable and checks that loading fails with an error that names node:ffi, that flag and the WASM fallback
- [ ] #5 `node --test pkg/@eserstack/ajan` and codebase/ajan-ffi-parity.test.ts pass, the triple strings in targets.ts are unchanged, and `git grep -n denoTarget` returns nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 8 files, 6 pass, 2 fail; 22 tests pass, 3 fail. Before `make ajan-wasm`, loader-reactor, node-reactor-log and profile-parity also failed: a stale pkg/@eserstack/ajan-wasm/eser-ajan.wasm that exports _start ("instance.exports._start must be undefined"); after the rebuild dist/wasi/eser-ajan.wasm is found first. Check what the ajan-wasm package ships.
- Deno API in tests: ffi/resolve.test.ts:9-11 has a top-level Deno.build, so the file fails to load; it also uses Deno.makeTempDir, mkdir, writeTextFile, realPathSync and remove (14 lines). ffi/mod.test.ts:121-144 uses Deno.makeTempFile and `new Deno.Command(Deno.execPath())` (the port this task names).
- Assertion semantics: ffi/mod.test.ts:71-83 selectBackend expects detectRuntime() === "deno".
- Non-test source: Deno. 117 (ffi/backend-deno.ts 105, ffi/mod.ts 5, ffi/resolve.ts 4, close-guard 1, client 1); Bun. 4 and bun: 6 (wasm/resolve.ts, ffi/resolve.ts, ffi/mod.ts); jsr:/npm: 0. FFI under node loads through koffi (backend-node.ts:43-94), not node:ffi.
- Go and docs naming Deno: main.go (2), pin_image_posix.go (2), panic_guard.go (1), bridge_codebase.go (2), bridge_ai.go (1), bridge_log.go (1), bridge_handle_safety_test.go (1); README.md (11), examples/browser/README.md (1), npm/root-package.json (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/ajan/ffi/mod.test.ts: 2 failing, 2 passing; first error: AssertionError: Values are not equal.
- pkg/@eserstack/ajan/ffi/resolve.test.ts: 1 failing, 0 passing; first error: ReferenceError: Deno is not defined
- pkg/@eserstack/ajan/wasm/node-reactor-http.test.ts: 1 failing, 0 passing; first error: see the run
- pkg/@eserstack/ajan/wasm/profile-parity.test.ts: 1 failing, 0 passing; first error: see the run
<!-- SECTION:NOTES:END -->
