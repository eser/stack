---
id: TASK-273
title: >-
  ajan: serve the WASM fallback through one reused reactor instance and delete
  command mode
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 18:37'
labels:
  - ajan
  - wasm
  - ffi
  - performance
milestone: m-0
dependencies:
  - TASK-272
priority: high
ordinal: 273000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-45, a WASM call must cost well under 10 ms. Command mode costs 14-15 ms of main-thread CPU per call because every call instantiates the module and reruns package init. The WASM profile spike measured a reused reactor instance on the wasi profile at a one-time load of about 25 ms wall / 20 ms thread / 41-47 ms process CPU, then 3 µs (version) to 27 µs (formatEncode) per call. Memory stayed flat over 100k calls, and recovered panics left the instance healthy.

Go side (main_wasi_reactor.go, built by `make ajan-wasm` with `-buildmode=c-shared`, so the module exports `_initialize` and never calls proc_exit):
- `eser_ajan_alloc(size) -> ptr`: a pointer into a Go-owned input arena
- `eser_ajan_call(namePtr, nameLen, argsPtr, argsLen) -> len`: looks the name up in the TASK-272 registry, runs the handler under the panic guard, and writes a `{ok, result, error}` envelope
- `eser_ajan_result_ptr() -> ptr`
- Args are raw bytes: the bridge's own request JSON, with length-prefixed positional args, not a `{"requestJSON": "..."}` object. The double decode cost 9.4 ns/B in the spike.
- A handler result of the form `{"error": ...}` becomes `ok: false`, so callers and tests stop counting failures as successes.
- `version` answers the ABI version, the profile name and the registered name list, used as a handshake at load.
- Delete main_wasi.go and the eserajan_reactor tag split in targets.ts. The handle-based names in the profile (parsing and codebase streams, cache) now keep their handles across calls.

TypeScript side (pkg/@eserstack/ajan/wasm):
- Rewrite loader-reactor.ts as the only WASM loader. It keeps the `lib.symbols` facade that callers use until TASK-238, and maps each symbol to a dispatcher name.
- Host rules: compile the module once per process and keep one instance; any exception that is not an envelope (RuntimeError, RangeError, proc_exit) marks the instance dead and the next call builds a new one from the cached module (about 4 ms on the profile); drain the shim's stdout and stderr after every call; take `memory.buffer` again after every export call.
- Give the module a node:wasi preopen of the working directory when node:wasi is available, so the 25 fs names work. Under the plain shim (the browser example) they return the WASI error.
- Delete loader-command.ts, the `mode` option and every command-mode path in wasm/mod.ts and wasm/resolve.ts, and update the module docs, which still say handles do not work.
- Update the ajan README and examples/browser to the reactor.

Plan key: M0-T23. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -n -i -e 'loader-command' -e 'command mode' -e 'main_wasi.go' -- pkg/@eserstack/ajan` returns nothing, and main_wasi_reactor.go exports only eser_ajan_alloc, eser_ajan_call and eser_ajan_result_ptr besides _initialize and memory
- [x] #2 A benchmark on the pinned Node minor shows a warm formatEncode call under 0.1 ms of main-thread CPU (median) and under 10 ms at p99, and records the one-time load time
- [x] #3 A test makes a handler panic and a later call on the same instance succeeds; a test forces a trap and the next call succeeds on a new instance
- [x] #4 A test opens a parsing stream, pushes to it in a later call and closes it, all on one instance
- [x] #5 A handler returning `{"error": ...}` reaches the caller as a failure, and a test checks that codebaseValidateFiles on a missing root reports an error, not a pass
- [x] #6 With node:wasi and a preopened fixture directory, codebaseWalkFiles returns the fixture's files
- [x] #7 The version handshake reports the ABI version, the profile name and the name list, and the loader refuses a module with a different ABI version with an error that names both versions
- [x] #8 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. main_wasi_reactor.go (//go:build wasip1) exports only eser_ajan_alloc, eser_ajan_call and eser_ajan_result_ptr besides _initialize and memory; the protocol (length-prefixed args, the {ok,result,error} envelope, an {"error":...} answer failing the envelope, the version handshake with abi, profile and names) is in tag-free reactor_protocol.go, covered by native Go tests (reactor_protocol_test.go: arg decoding, unknown name, arity, error answers, a panicking handler followed by a successful call, handshake fields, 99 names natively). main_wasi.go, the eserajan_reactor tag split and the second WASM target are gone; targets.ts lists one WASM target. wasm/loader-reactor.ts is the only WASM loader: module compiled once, one instance, any non-envelope exception drops the instance and the next call builds a new one synchronously, shim stdout/stderr drained after each call, memory.buffer re-read after each export call, node:wasi with a preopen of the cwd (and PWD) when available (Node and Deno both have it), the plain shim otherwise; it keeps the lib.symbols facade with positional args in Go parameter order, and names outside the profile throw UnsupportedInWasmError (code UNSUPPORTED_IN_WASM). loader-command.ts, the mode option of loadEserAjanWasm and resolveWasmPath, and their docs are gone; the ajan README, ajan-wasm README, the browser example (now on the reactor protocol) and the wasi-shim docs are updated; the shell packages' error messages no longer mention the removed mode. codebase/ajan-ffi-parity.test.ts now compares the loader's dispatch names with the names registered in Go. TS tests (wasm/loader-reactor.test.ts): handshake with the 44 names, ABI refusal, warm formatEncode median about 26 us and p99 about 37 us with a load of about 10 ms on darwin/arm64 (asserted under 0.1 ms and 10 ms), a forced trap replaced on the next call, a parsing stream across calls, codebaseValidateFiles on a missing root failing the envelope, a preopened fixture walk, UnsupportedInWasmError. deno rtk task cli ok passed on 2026-10-24 (including go-check, go-lint and go-tests of both modules).
<!-- SECTION:NOTES:END -->
