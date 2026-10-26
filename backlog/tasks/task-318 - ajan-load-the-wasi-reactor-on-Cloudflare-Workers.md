---
id: TASK-318
title: 'ajan: load the wasi reactor on Cloudflare Workers'
status: To Do
assignee: []
created_date: '2026-10-24 02:30'
labels:
  - ajan
  - track-l
milestone: m-7
dependencies:
  - TASK-238
  - TASK-273
  - TASK-285
priority: medium
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-45 (amended 2026-10-24) and decision-52, eserstack libraries that delegate to Go run on Cloudflare Workers through the wasi-profile reactor. workerd has no node:ffi, so the ajan loader picks the reactor there. Names outside the profile stay unavailable on workerd and fail the workerd build (doc-3 section 19).

In pkg/@eserstack/ajan:
- A workerd host for the reactor from TASK-273. Workers do not compile Wasm from bytes at runtime (L-S4 confirms), so the host takes a `WebAssembly.Module` that the Worker bundle imports, instead of reading eser-ajan.wasm from disk. It instantiates lazily on the first call and keeps one instance per isolate, with the same trap and restart rules as the Node host.
- workerd has no node:wasi, so the host uses the plain WASI shim. The 25 fs names answer the WASI error unless L-S4 shows nodejs_compat's virtual filesystem can back a preopen; the TASK-238 table marks them `fs`, and the loader rejects them on workerd with a typed error before the call.
- The network names from TASK-277 work on workerd only if its spike shows JSPI works there; otherwise they answer UNSUPPORTED_IN_WASM on workerd.
- A `workerd` export condition in the ajan package.json points the loader at this host, so bundles for workerd never contain the node:ffi backend.
- The build check that laroux-server runs for workerd (TASK-312) reads the TASK-238 table: a workerd server graph may reach @eserstack/ajan, and fails when it reaches node:ffi or a binding whose `wasm` field is not `yes`. Pick how the check finds the reachable bindings (per-name call modules generated from the table, or a scan of literal names in the bundle), and record the choice in WIRING.md.
- Measure the Worker bundle's compressed size with and without the reactor, the first-call time in a fresh isolate and memory after 10k calls, and document them in the ajan README with the Workers limits they are compared against.

Plan key: L8. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In `wrangler dev`, a Worker calls formatEncode and cryptoHash through @eserstack/ajan and gets the same results as the native library on shared fixtures
- [ ] #2 A test forces a trap and the next call succeeds on a new instance in the same isolate
- [ ] #3 A workerd fixture that calls a name whose `wasm` field is `no` fails the build with a message naming the binding and the import chain, and a call to an `fs` name on workerd gets the typed error
- [ ] #4 The workerd bundle contains no node:ffi import, and the ajan README documents the workerd host, its limits and the measurements
- [ ] #5 The gate passes
<!-- AC:END -->
