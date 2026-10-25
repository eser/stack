---
id: decision-37
title: FFI mechanism on Node
date: '2026-10-15 20:38'
status: accepted
---

## Context

The bridge stays (decision-22), so the FFI mechanism is permanent, not a stopgap until M6.

node:ffi (nodejs.org/api/ffi.html, v26.12.0) arrived in 26.1.0 behind `--experimental-ffi` and is on by default since 26.9.0. It is still "Stability: 1 - Experimental", `--no-experimental-ffi` turns it off, and under the permission model it needs `--allow-ffi`. Its API is `dlopen(path, { symbol: { arguments, return } })` and `DynamicLibrary` with `getFunction`, `registerCallback` and `close`, over ints, floats, pointer, string, buffer, arraybuffer and function types. Calls are synchronous only, with no documented async or off-thread mode. Callbacks must run on the thread that created them, so Go goroutines cannot call into JavaScript. The bridge needs no callbacks: it is string in, string out, with polling reads for streams. Since 26.10.0, `dlopen` accepts paths inside a mounted SEA VFS.

koffi 3, the Node backend today, works against the dylib, but it is a native npm dependency with per-platform packages and an allowBuilds entry. Its async calls run on the 4-thread libuv pool, where 8 concurrent calls measured a 2 s fs stall, and long-lived readers hold pool threads indefinitely. M1-T8 removes it, and it is not a fallback.

Because node:ffi is experimental, a breaking minor would leave only the WASM fallback (decision-45), which serves a subset of the calls. The M0-T2 spike measures (a) loading and calling a dispatcher through node:ffi, (b) the worker-thread pattern's throughput and cancellation, (c) whether the Go-in-host teardown SIGSEGV seen under Deno happens under Node, and (d) stdin, raw mode and SIGWINCH sharing between Go and Node.

## Options

- node:ffi as the native loader, with a generic dispatcher in the Go ABI and blocking calls in worker threads, and the WASM build (WASI) as the fallback when node:ffi cannot load
- koffi: synchronous calls in M1, async calls on the libuv pool or in workers in M2 (rejected: koffi is removed, also as a fallback)
- A Go sidecar over JSON-RPC

## Recommendation

node:ffi, with one loader order: node:ffi first; if it cannot load (for example under `--no-experimental-ffi`), the WASM build (WASI, decision-45); if that fails too, a clear error and exit. Nothing else.
- M1-T8 deletes the koffi backend together with the Deno and Bun backends, and koffi leaves every package.json, the npm bundle manifests, the npm externals list and the pnpm-workspace allowBuilds. The platform packages keep only the Go shared library. Calls stay synchronous on the existing exports through the cutover.
- M2-T7 replaces the 100 hand-listed exports with a dispatcher: `EserAjanCall(name, requestJson) -> responseJson`, `EserAjanStreamOpen`, `EserAjanStreamRead` and `EserAjanStreamClose`, `EserAjanFree`, and `EserAjanVersion` for a handshake at load. A missing function is an error JSON the TypeScript side reports, not a failed load. The TypeScript bindings become one table that the parity test checks against the Go registry. The WASM build dispatches through the same registry.
- M2-T8 runs blocking calls in `node:worker_threads` workers that `dlopen` the library themselves and answer by message: one worker per long-lived reader (each PTY pane, each AI stream) and a bounded, documented pool for request and response calls. An AbortSignal calls the matching cancel function. Short calls stay synchronous on the main thread.

WASM fallback shape (decision-45, 2026-10-24): one c-shared reactor of the slim wasi profile, reached through its `eser_ajan_call` export over the same registry, with one instance reused per process (and per worker in M2-T8). The spike measured 3-27 µs per call after a one-time load of about 25 ms wall / 20 ms thread CPU. A trapped instance is replaced from the cached module, not reused.

Controls: CI pins the exact Node minor (decision-14) and runs the FFI suites on every Node bump. If the M0-T2 spike shows that the dispatcher and worker design does not hold, record the failure here for the owner before M1 starts; koffi is not a fallback. No sidecar, per decision-22.

## Decided by

The owner accepted this on 2026-10-15, with the WASM build as the fallback. Record the M0-T2 outcome here, citing measurements (a) to (d), before M1 starts.

## M0-T2 outcome (TASK-175, 2026-10-24)

Measured on Node v26.12.1 (pin this minor per decision-14), macOS arm64 (Apple M4 Max) and Linux arm64 (docker node:26.12.1, Debian 13), against libeser_ajan with a throwaway `EserAjanCall(name, argsJSON)` dispatcher built over the existing registry. The design holds.

- (a) Holds. node:ffi needs no flag (only `--allow-ffi` under `--permission`) and prints an ExperimentalWarning. dlopen takes 2.4 ms (macOS) and 2.9 ms (Linux); the EserAjanVersion handshake, a formatEncode dispatcher call, the error JSON for an unknown name and for a wrong arity, and reading plus freeing the returned string with EserAjanFree all work on both OSes. node:ffi silently ignores misspelled signature keys (a `result:` key declares a void function), so the bindings need a test of their declared signatures.
- (b) Holds. Dispatcher calls run at 1.57M/s (macOS) and 1.23M/s (Linux) on the main thread for `version`, 229k/s and 185k/s for formatEncode, about 2.7 times slower than a direct export; 1.44M/s and 1.11M/s inside a worker. Main-to-worker round trips: 51k/s and 20k/s awaited one by one, 526k/s and 490k/s pipelined. With 8 workers blocked in 1-second calls, timer lateness stayed at the idle level (max 2.82 ms against 2.07 ms idle on macOS, 5.28 against 5.40 on Linux), fs.promises.readFile of 8 MiB took a median 0.84 and 5.93 ms, and the 8 calls finished together in about 1 s. A main-thread cancel ends a blocked worker call in p50 0.105 ms (max 0.249) and 0.366 ms (max 0.644). A second dlopen in a worker shares the main thread's Go image. node:ffi has no dlopen-flags option and Node dlcloses the library at worker teardown, so on macOS the library's RTLD_NODELETE constructor (pin_image_posix.go) is required: without it, worker teardown after the last handle hangs in an unkillable spin. Linux gets NODELETE from the Go linker. worker.terminate() waits for an in-flight native call (about 3 s in the test), so only a Go-side cancel interrupts a blocked call.
- (c) Holds. No signal and no Go fatal-error marker in 1,040 runs on macOS and 1,220 on Linux (load, call, worker exit, natural exit and process.exit(0), with and without a busy GC, with a worker blocked in Go): the Deno teardown SIGSEGV does not happen on Node, so the hard exits in codebase/cli-support.ts and workflows/main.ts are not needed for it. Exit waits for an in-flight blocked call (about 5 s); cancelling open tokens in an exit hook first brought it to 57 to 75 ms.
- (d) Holds with a rule. Raw mode works from either side, but one process cannot share the terminal between Go and Node: Node's first touch of process.stdin reopens and dup2s the tty, which silently ends Go's keypress reader on both OSes and on macOS blocks Node's main thread until Go's in-flight read returns (a hard hang in canonical mode); and SIGWINCH goes to whichever side installed its handler last, since Go does not forward async signals. shellTuiKeypressClose blocks its caller up to closeWaitTimeout (804 to 823 ms measured), so it belongs in a worker.

Constraints the implementation carries (M1-T8, M2-T7, M2-T8): keep and test the macOS pin; give every blocking export a Go-side cancel and cancel open tokens on exit; test the node:ffi signatures; one terminal owner per process (either the Go reader owns stdin and Node never touches process.stdin, with process.stdout touched before Go's signal.Notify, or the TUI keypress path becomes Node-native instead of keypress-go.ts), and run shellTuiKeypressClose off the main thread. Full measurements and scripts are in the TASK-175 notes.

## Blocks

TASK-202 (M1-T8), TASK-238 (M2-T7), TASK-239 (M2-T8), TASK-273 (M0-T23)

Plan key: `ffi-on-node`
