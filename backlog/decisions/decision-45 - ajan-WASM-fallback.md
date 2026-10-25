---
id: decision-45
title: ajan WASM fallback
date: '2026-10-15 20:38'
status: accepted
---

## Context

The WASM build is the only path for windows/arm64, which has no platform package because Go has no `-buildmode=c-shared` for that target, and the path the loader takes when node:ffi cannot load (decision-37). node:ffi covers every other release target, but it is experimental and `--no-experimental-ffi` turns it off.

The WASM profile spike (2026-10-23, etc/temp/plan/ajan-wasm-spike.json, all figures measured on Node 26.5 and Go 1.26.5) found:
- Size: a build of the current tree is 80.7 MB in command mode and 76.5 MB in reactor mode (8.2 and 7.6 MB with brotli), and the published ajan-wasm 4.5.2 unpacks to about 157 MB. The AI SDK chain (anthropic-sdk-go, openai-go, genai with gRPC, protobuf and Google auth) is 62% of it, because bridge.go:65 builds `aiRegistry` with every provider factory as a package-level var, and the SDKs' own init and `reflect.MethodByName` keep their type graphs alive. Go's wasm backend adds 320 B of findfunctab per function, 23% of the file. None of that code can work on wasip1: dials are refused and there is no exec. An earlier version of this record said about 22 MB, then 76.5 MiB with no cause; both are superseded by these figures.
- Per-call cost: command mode costs 14-15 ms of main-thread CPU on every call, the same for every function. Instantiate (a fresh 45 MiB memory and 38.8 MB of data segments) is 6 ms and package init is 8-9 ms, 5.3 ms of it jsonschema/v6 compiling five metaschemas. The function itself takes 0.04-0.15 ms.
- What works: through the shipped loaders, command mode serves 16 of the 100 symbols correctly, 3 more report success while doing nothing (codebaseValidateFiles, codebaseWalkFiles, collectorWalkFiles), and reactor mode serves none usefully. The figure of 43 in an earlier version of this record was wrong.
- The fix: a slim "wasi" profile (per-domain bridge files behind build tags, plus four framework import edges cut) is 7.26 MB raw and 1.41 MB brotli with 44 names. Built as a c-shared reactor with one dispatcher export and one instance reused per process, it loads once in about 25 ms wall and 20 ms thread CPU, then serves calls in 3-27 µs, and handles persist across calls.

## Options

- Drop the WASI build in M6-T3 (rejected)
- Keep the current command-mode and reactor builds behind the dispatcher (rejected: 80 MB and 14-15 ms per call)
- One slim reactor build of the "wasi" profile, reached through a dispatcher export, with command mode deleted
- TinyGo (not now: a second toolchain, 4-minute builds, text/template and expr gaps; its only remaining win is a 9 ms cold load)

## Recommendation

One slim reactor build:
- Hosts: Node, for windows/arm64 and runs with node:ffi turned off, and Cloudflare Workers, where workerd has no node:ffi and laroux apps call eserstack libraries through the reactor (TASK-318). No second "pure" profile for browsers or other edge runtimes; the browser example keeps working on the same artifact through the shim, with the fs names unavailable.
- Budget: the owner's 10 ms limit applies per call. The one-time instance load (about 20 ms thread CPU) is outside it.
- Mode: `-buildmode=c-shared` reactor with the `eser_ajan_alloc`, `eser_ajan_call` and `eser_ajan_result_ptr` exports, one instance per process (and per worker thread in M2-T8), replaced after a trap. Command mode, main_wasi.go, wasm/loader-command.ts and the command build are deleted (TASK-273).
- Profile: only "wasi" ships, with the 44 names that work on wasip1, built from per-domain bridge files and the dispatcher registry. Every other name answers `UNSUPPORTED_IN_WASM`. The full WASM build is not shipped. CI enforces a size budget and a dependency exclusion list (TASK-272).
- Filesystem: the loader gives the module a node:wasi preopen of the working directory, so the 25 fs names (codebase walks and validators, noskills, cache, csGenerate) work.
- Logging: logfx makes OpenTelemetry optional so logging joins the profile without the OTel SDK (TASK-278).
- Network: a host fetch import lets httpclient run on the WASM fallback. It is planned early, in M2, right after the reactor work (TASK-277).
- Framework changes the owner accepted on 2026-10-24: F4 moves pkg/ajan/lib's crypto, net and sql helpers into their own package, and F2 makes codebaseGit*, generateChangelog and csSync answer "unknown function" on wasip1 instead of "exec not found".
- Order: the profile and reactor work is M0 (TASK-272, TASK-273), ahead of M1-T8, which wires the loader order onto the reactor.

## Decided by

The owner accepted keeping the WASM fallback on 2026-10-15, and on 2026-10-24 accepted the slim reactor profile, deleting command mode, Node-only hosts, the per-call reading of the 10 ms budget, the fs preopen, optional OTel in logfx, an early host fetch import, the F2 and F4 changes, and doing this work before M1. Later on 2026-10-24 the owner widened the hosts to Cloudflare Workers for laroux (doc-3 section 25, question 1). Record it in ADR 0005 (M0-T1).

## Blocks

TASK-272 (M0-T22), TASK-273 (M0-T23), TASK-202 (M1-T8), TASK-238 (M2-T7), TASK-277 (M2-T11), TASK-278 (M2-T12), TASK-267 (M6-T1), TASK-268 (M6-T2), TASK-269 (M6-T3), TASK-318 (L8)

Plan key: `wasm-fallback`

## Amended

2026-10-24: the Context and Recommendation were rewritten from the WASM profile spike. The 2026-10-15 recommendation kept both WASM modes and routed them through the M2-T7 registry.

2026-10-24, later: the owner widened the hosts to Cloudflare Workers (doc-3 section 25, question 1). laroux server graphs on workerd may call the profile's names through the reactor; a binding outside the profile fails the workerd build. TASK-318 builds the workerd host, TASK-285 (L-S4) measures it, and TASK-277 records whether JSPI carries network there.

2026-10-25: the TASK-277 spike chose JSPI for network on the fallback. The host wraps the `eser_host` fetch import in `WebAssembly.Suspending` and calls the network names through `WebAssembly.promising`; every other name stays a synchronous call on the same instance. JSPI is on by default in Node 26.12.1 and in workerd 2026-10-07, where a Go wasip1 reactor fetched through it with a goroutine timer firing across the suspension. The Atomics approach was as fast but moves every call to a worker thread, and workerd has no worker threads. A network name called without `promising` throws SuspendError, so the loader routes those names itself. The timings are in TASK-277's notes.
