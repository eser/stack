---
id: TASK-277
title: 'ajan: run httpclient on the WASM fallback through a host fetch import'
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 22:10'
labels:
  - ajan
  - wasm
  - httpclient
  - go
milestone: m-2
dependencies:
  - TASK-273
priority: high
ordinal: 277000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-45, Go's wasip1 refuses every dial, so httpclient, posts and later AI answer UNSUPPORTED_IN_WASM. The owner wants network on the WASM fallback early, so this task starts as soon as TASK-273 lands and runs in parallel with M1, without waiting for M2's other tasks.

The host's fetch is asynchronous, and a wasm import is synchronous. Start with a written spike that measures two ways to bridge that on the pinned Node minor:
- JSPI: the host wraps the import in `WebAssembly.Suspending` and `eser_ajan_call` in `WebAssembly.promising`. Check that Go's wasip1 runtime tolerates a suspended stack, including goroutines and timers.
- A worker that owns the reactor instance and blocks on `Atomics.wait` while the main thread runs fetch and writes the response into a SharedArrayBuffer.

Also record whether JSPI works on workerd: it has no worker threads, so the Atomics approach cannot carry network there, and the reactor runs on workerd since 2026-10-24 (TASK-318).

Then implement the chosen one:
- Go: an http.RoundTripper for wasip1 that calls an `eser_host` fetch import with the method, URL, headers and body, and reads status, headers and body back, with streaming bodies read in chunks. httpclient uses it on wasip1, and its httpRequest and stream names join the wasi profile.
- TS: the reactor host provides the import on Node's fetch, applies the request's timeout and AbortSignal, and never follows a redirect to a different scheme.
- Measure the profile size change. net/http without the default transport must stay out of crypto/tls; a budget raise in TASK-272's check needs the owner's approval.

posts and AI join only after this lands, AI after TASK-279 removes the vendor SDKs.

Plan key: M2-T11. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The spike result, with timings for both approaches, is recorded in this task's notes and decision-45 names the chosen approach
- [x] #2 Under `--no-experimental-ffi`, a TS test makes an httpclient request through the WASM fallback to a local test server and gets the status, headers and body
- [x] #3 A test aborts an in-flight request through its AbortSignal and the instance keeps serving calls
- [x] #4 The profile's size check and dependency check pass, with any raised limit approved by the owner
- [x] #5 `pnpm cli ok` (or `deno task cli ok` if M1 has not landed) passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 spike (AC #1), on Node 26.12.1 and workerd 2026-10-07 (npm workerd@1.20261007.1 in a scratch directory, not a repo dependency). The probe is a Go 1.26 wasip1 c-shared reactor (2.2 MB) with go:wasmimport eser_host.http_fetch(ptr,len)->size and http_take(ptr). Two imports because the host cannot write into a Go buffer that does not exist yet: Go allocates after it learns the size. A local node:http server answers; 200 sequential requests per size; times in ms per request, mean/p50/p95.
JSPI (import in WebAssembly.Suspending, export in WebAssembly.promising), against Node fetch directly:
- 16 B: 0.250/0.211/0.570, against 0.239/0.158/0.768
- 64 KiB: 0.262/0.224/0.482, against 0.121/0.106/0.175
- 1 MiB: 2.165/1.274/6.797, against 0.535/0.468/0.981 (the extra time is two copies of the body)
- A call that never suspends costs 0.042 us p50 plain and 0.333 us p50 through promising.
Atomics (a worker owns the instance; the import posts the request to the main thread and blocks in Atomics.wait on a SharedArrayBuffer):
- 16 B: 0.253/0.221/0.513
- 64 KiB: 0.264/0.228/0.386
- 1 MiB: 0.947/0.894/1.315
- Plain call 0.042 us p50, but only on the worker. Every call from the main thread crosses threads, because handles live in the one instance.
Findings:
- Go's runtime survives the suspension: a goroutine with a 1 ms timer, started before the import, fired before the export returned, on Node and on workerd.
- A sync export call that reaches the suspending import throws SuspendError ('trying to suspend without WebAssembly.promising'), so the loader must call the network names through promising.
- Interleaving works: 200 rounds of 1000 sync calls into the instance while a fetch was suspended (host delayed 20 ms), with no failure and every timer fired. Two concurrent fetches also both returned. The implementation still keeps one suspended network call per instance (a queue in the host), because the host's response hand-off is per instance.
- On workerd, JSPI is present. It needs the plain WASI shim to answer fd_prestat_get with EBADF; ENOSYS panics Go's syscall init ('fd_prestat: Not implemented on wasip1'), which TASK-318's shim must also do. workerd's performance.now() only advances on I/O, so no workerd timings.
Decision: JSPI, recorded in decision-45 (amended 2026-10-25). Spike sources: etc/temp/spike-277/ (gitignored). Implementation (AC #2-#5) is next.

2026-10-25 implementation.
Design change from the description, forced by its own constraint: an http.RoundTripper means linking net/http, and on wasip1 net/http pulls in crypto/tls. A probe module grew from 3,012,782 to 10,322,971 bytes, far over the 8 MB budget, and ^net/http$ is on the forbidden list. So the http names have a wasip1 implementation that speaks to the host directly, and httpclient itself stays native-only.
Go:
- host_fetch_wasi.go (wasip1 && eserajan_wasi): imports eser_host.http_fetch / http_read / sleep (suspending), http_release / http_take (sync), and the export eser_ajan_call_async with its own result buffer (eser_ajan_async_result_ptr). The separate buffer matters: a sync call may run between an async call returning and its host reading the result.
- bridge_http_wasi.go: httpCreate/Request/Close/RequestStream/StreamRead/StreamClose, answering the native JSON.
  - Retry and circuit-breaker rules are those of ResilientTransport, error wording included. The timeout bounds the whole request with retries, as http.Client.Timeout does. Headers are canonicalized; status texts come from a copy of net/http's table (status_text_wasi.go).
- Retry backoff waits through the host (sleep), not a blocking poll_oneoff.
- The breaker and the retry strategy moved to pkg/ajan/httpclient/resilience, which has no net/http; httpclient keeps aliases, so its API is unchanged (connfx and tests untouched).
- Wire types are in bridge_http_wire.go, shared with the native bridge_http.go.
- Reactor ABI 2 on both sides.
- Profile: 55 names (the six http names added). AC #4: 7,917,801 bytes raw, 1,528,480 brotli (was 7,816,793 / 1,509,390; limits 8,000,000 / 1,600,000), and no forbidden package. No budget change.
TS:
- wasm/host-fetch.ts builds the eser_host imports. It uses Suspending when JSPI exists; otherwise the http names answer an error.
  - Applies timeoutMs and the caller's AbortSignal (new ffi/request-signals.ts, exported as @eserstack/ajan/ffi/request-signals).
  - Follows at most 20 redirects and never to another scheme (it returns the 3xx); drops Authorization and Cookie across hosts; enforces maxResponseBytes; keeps stream bodies open by id.
- loader-reactor.ts calls the three waiting names through WebAssembly.promising, one at a time in a queue, while sync calls go on. EserAjanHttpRequest/RequestStream/StreamRead are typed string | Promise<string>.
- httpclient: go-client awaits them and takes a signal (sent as requestId). go-transport passes request.signal and rethrows the abort reason on abort, so the native transport fails like fetch.
Tests:
- AC #2 and #3: wasm/node-reactor-http.test.ts runs a fixture under node --no-experimental-ffi against a Deno.serve server. It checks that the reactor answered, status/statusText/header/body, POST echo, 404 as 'HTTP 404 Not Found', a same-scheme redirect followed, a cross-scheme one not followed, a streamed body, a sync call while a request waits, an abort in flight under 2 s ending 'request aborted', then a normal request on the same instance, and retries (two 503s then 200: retries 2).
- profile-parity.test.ts compares the http names with the native library against a server in a Worker (a native call blocks the test thread): identical apart from Date.
- The ajan-ffi-parity guard now also reads callAsync(...).
- AC #5: deno task cli ok passed; make ok passed; the bridge module's go test passed; make ajan-wasm-check passed.
Not done here: the workerd host is TASK-318's. The spike shows JSPI works there and that its WASI shim must answer fd_prestat_get with EBADF.
Docs: ajan README ('Network on the WASM fallback'), httpclient READMEs (TS and Go).
Note for the owner: 'git mv' of httpclient/circuit_breaker.go into resilience/ staged that rename in the index; nothing else was staged.
<!-- SECTION:NOTES:END -->
