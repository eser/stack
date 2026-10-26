---
id: TASK-238
title: 'ajan: replace the 100 FFI exports with a dispatcher ABI and one TS binding table'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 10:00'
labels:
  - ffi
  - ajan
  - performance
milestone: m-2
dependencies:
  - TASK-231
  - TASK-273
priority: medium
ordinal: 238000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decisions ffi-on-node and go-ts-boundary, the bridge stays and becomes the main way TypeScript packages delegate to Go, so its ABI shrinks to a small, stable surface.

Go side (pkg/@eserstack/ajan):
- Replace the 100 hand-listed `//export` functions in main.go with:
  - `EserAjanVersion`: the library version and the dispatcher ABI version, used as a handshake at load
  - `EserAjanCall(name, requestJson) -> responseJson`
  - `EserAjanStreamOpen(name, requestJson) -> handleJson`, `EserAjanStreamRead(handle) -> chunkJson` and `EserAjanStreamClose(handle)`, for the AI stream, HTTP stream, shell exec and PTY readers, the TUI keypress reader and the codebase walk, codebase validate and parsing tokenize streams
  - `EserAjanFree` for every returned string
- Export the dispatch registry that TASK-272 built from the per-domain bridge files, so the native exports and the WASM reactor share it. Init and Shutdown are registry entries. Writes, resize, kill, push and cancel on an open handle are `EserAjanCall` names that take the handle in the request.
- An unknown name returns error JSON with code `UNKNOWN_FUNCTION`, not a failed load. Every handler runs inside the existing panic guard, so a Go panic becomes error JSON.
- The WASM fallback already dispatches through that registry from its reactor export `eser_ajan_call` (TASK-273, decision-45), and a name outside the wasi profile returns error JSON with code `UNSUPPORTED_IN_WASM`. Keep the native `EserAjanCall` request and response shapes identical to the reactor's envelope, including `ok: false` for handler errors.

TypeScript side:
- Replace the hand-written binding lists in ffi/types.ts, ffi/backend-node.ts and wasm/loader-reactor.ts with one table: name, kind (call or stream), a blocking flag that M2-T8 uses, a `wasm` field (`yes`, `fs` or `no`) so the loader rejects native-only names without a round trip, and the request and response types.
- The loader checks `EserAjanVersion` right after `dlopen` and refuses a library with a different ABI version with an error that names both versions.
- A typed `call(name, request)` and `stream(name, request)` replace `lib.symbols.EserAjan*`. An `UNKNOWN_FUNCTION` response raises a typed error and leaves the library loaded.
- Change codebase/ajan-ffi-parity.test.ts to check the TS table against the Go registry in both directions, including each entry's kind, and each `wasm` field against the name list the reactor handshake reports.
- Calls stay synchronous on the main thread in this task. M2-T8 moves the blocking ones to worker threads.

Update the callers one commit per package (cross-package notes): the ffi-client.ts modules in cache, codebase, collector, crypto, cs, formats, httpclient, kit, logging, noskills, posts and shell, the ffi adapters in config, crypto, formats and parsing, ai/adapters/ajan-bridge.ts and cli/commands/ajan.ts. Update each package's WIRING.md, which documents `lib.symbols.EserAjan*` calls today, and the ajan README.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits); decision-37 (FFI mechanism on Node); decision-45 (ajan WASM fallback).

Plan key: M2-T7. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `grep '^//export' pkg/@eserstack/ajan/main.go` lists only EserAjanVersion, EserAjanCall, EserAjanStreamOpen, EserAjanStreamRead, EserAjanStreamClose and EserAjanFree
- [x] #2 A Go test calls EserAjanCall with an unknown name and gets error JSON with code UNKNOWN_FUNCTION; a TS test does the same through the loader, gets the typed error, and a later valid call on the same library succeeds
- [x] #3 A Go test makes a registered handler panic and gets error JSON while the test process keeps running
- [x] #4 A TS test feeds the loader a version handshake with a different ABI version and gets an error that names both versions
- [x] #5 `git grep -n 'symbols\.EserAjan' -- pkg` returns nothing
- [x] #6 codebase/ajan-ffi-parity.test.ts compares the TS table with the Go registry, and its fixture tests fail for a name present on one side only and for a kind mismatch
- [x] #7 A TS test starts Node with `--no-experimental-ffi`, loads the WASM build, makes a successful `call` through the same table, and gets the typed error for code UNSUPPORTED_IN_WASM from a name outside the wasi profile (shellExec or aiGenerate)
- [x] #8 Every *.ffi.test.ts suite and `pnpm cli ok` pass on the pinned Node 26 minor
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27. Go: main.go exports only EserAjanVersion, EserAjanCall, EserAjanStreamOpen, EserAjanStreamRead, EserAjanStreamClose and EserAjanFree (dispatcher ABI 3). The tag-free registry (bridge_registry.go) holds call entries (register(name, func(request string) string)) and stream entries (registerStream(name, handlePrefix, {open, read, close})); a stream read or close finds its stream from the handle prefix, so the dispatcher keeps no handle table. dispatch.go answers one envelope for every operation, {ok, result, code, error}: HANDLER_ERROR and PANIC keep the answer in result; UNKNOWN_FUNCTION (UNSUPPORTED_IN_WASM on wasip1), KIND_MISMATCH, UNKNOWN_HANDLE and BAD_REQUEST (JSON nested past formatfx.MaxNestingDepth) carry none. Every handler runs under its own recover. 75 calls and 8 streams natively (aiTextStream, httpRequestStream, shellExecStream, shellPtyStream, shellTuiKeypressStream, codebaseWalkFilesStream, codebaseValidateFilesStream, parsingTokenizeStream, which is push-fed and has no read); writes, resize, kill, push and cancel stay calls with the handle in the request. aiGenerateText and the aiTextStream open take {modelHandle, options}. version answers the handshake {version, abi, profile, names, streams}, the same JSON as EserAjanVersion; init and shutdown answer {}. The reactor sends the stream operations as the reserved names stream.open, stream.read and stream.close through eser_ajan_call and eser_ajan_call_async, with the same envelope; guardInt and bridgeVersion are gone. Go tests (dispatch_test.go through the cgo exports via export_call.go, reactor_protocol_test.go): unknown name, panicking call and stream read followed by a successful call, handler error, kind mismatch, deep request, a walk stream through the exports, unknown handles, the handshake, 83 names.

TypeScript: ffi/bindings.ts is the one table (kind, blocking, wasm yes/fs/no, async, request and answer types carried by each entry's `as` type); ffi/library.ts builds call and stream over a backend transport (closed guard, wasm "no" refused without a round trip, envelopes without result raise UnknownFunctionError, UnsupportedInWasmError or AjanCallError), ffi/backend-node.ts declares the six prototypes and refuses another ABI after dlopen with AbiMismatchError naming both versions, wasm/loader-reactor.ts is a transport over the reactor, ffi/fake.ts builds a handler-backed library for tests; close-guard.ts is gone. Callers in ai, cache, cli, codebase, collector, config, crypto, cs, formats, httpclient, kit, logging, noskills, parsing, posts and shell use lib.call and lib.stream, their WIRING.md files, the ajan README and examples (C, Python and Rust run against the built library) describe the dispatcher. Bugs found by the migration, each with a test: httpclient and the Go logger sent {"handle":...} to httpClose and logClose, which take the bare handle, so those handles were never released; the httpclient stream body dropped bytes that arrived with done and never closed a stream read to its end. codebase/ajan-ffi-parity.test.ts compares the table with the Go register calls and with the native handshake (names and kinds both ways), the wasm fields with the reactor handshake, and the six exports with the node:ffi prototypes; its fixture tests report a name on one side only and a kind mismatch. AC #7 is ffi/mod.test.ts (--no-experimental-ffi, formatList through the table, shellExec gives UnsupportedInWasmError with code UNSUPPORTED_IN_WASM). Calls stay synchronous; blocking marks the names TASK-239 moves to workers. Verified on Node 26.12.1: go test and golangci-lint of the bridge module, the 7 *.ffi.test.ts suites, the ajan and caller package tests, and pnpm cli ok (all checks passed).
<!-- SECTION:NOTES:END -->
