---
id: TASK-401
title: 'test: order the tests that wait or time by a synchronization point'
status: To Do
assignee: []
created_date: '2026-11-16 00:10'
labels:
  - test
  - ci
milestone: m-2
dependencies: []
priority: medium
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A test that sleeps before it checks, or that compares a wall-clock duration with a bound, passes or fails by how busy the machine is. Main runs of 5.0.0 failed twice that way: the reactor timing test (TASK-385, replaced by an instance count in pkg/@eserstack/ajan/wasm/loader-reactor.test.ts) and `a reader that stops after one step stops the Go run`, whose sleep hid a function stream that ran ahead of its reader (TASK-396, TASK-397). The repository has more of both.

Narrow wall-clock bounds, the first to change:
- pkg/@eserstack/kit/recipes/processor.test.ts:70, under 1 s
- pkg/@eserstack/agents/guards/git.test.ts:169, under 1 s
- pkg/@eserstack/bundler/css/fonts.test.ts:156, under 1 s
- pkg/@eserstack/ajan/ffi/workers.ffi.test.ts:217, 8 calls under 3 s
- pkg/@eserstack/functions/resources.test.ts:434, at least 100 ms
- pkg/@eserstack/testing/temp-dir.test.ts:70, at least 45 ms
- pkg/ajan/functionsfx/combinators_test.go:376, at least 25 ms

Wide upper bounds that catch a hang (5 s to 30 s, for example pkg/ajan/acpfx/spawn_test.go:307, pkg/ajan/kitfx/applier_test.go:98 and :191, pkg/ajan/workflowfx/workflowfx_phase_c_test.go:139) are a limit on how long to wait, not the assertion itself, and can stay where nothing else bounds the wait.

Tests that order by sleeping. Go, `time.Sleep` in: cmd/noskills/run_binary_test.go, pkg/@eserstack/ajan/bridge_handle_safety_test.go, pkg/ajan/acpfx/jsonrpc_test.go, pkg/ajan/acpfx/loopback_test.go, pkg/ajan/acpfx/shim/shim_test.go, pkg/ajan/aifx/stream_cancel_test.go, pkg/ajan/functionsfx/combinators_test.go, pkg/ajan/httpclient/httpclient_coverage_test.go, pkg/ajan/httpfx/middlewares/rate_limit_middleware_test.go, pkg/ajan/muxfx/frontend_test.go, pkg/ajan/muxfx/leak_test.go, pkg/ajan/noskillsserverfx/dashboard_screen_corpus_test.go, pkg/ajan/noskillsserverfx/dashboard_ws_test.go, pkg/ajan/noskillsserverfx/mux_remote_test.go, pkg/ajan/noskillsserverfx/server_test.go, pkg/ajan/noskillsserverfx/worker_mux_test.go, pkg/ajan/noskillsserverfx/wt_attach_ledger_lines_test.go, pkg/ajan/processfx/process_concurrency_test.go, pkg/ajan/shellfx/exec/exec_test.go, pkg/ajan/shellfx/exec/stream_test.go, pkg/ajan/shellfx/tui/tui_close_test.go, pkg/ajan/shellfx/tui/tui_test.go, pkg/ajan/workerfx/runner_test.go. TypeScript, `setTimeout(resolve, ...)` in: pkg/@eserstack/ajan/ffi/workers.ffi.test.ts, pkg/@eserstack/ajan/wasm/node-reactor-http.test.ts, pkg/@eserstack/functions/resources.test.ts, pkg/@eserstack/kit/recipes/tar.test.ts, pkg/@eserstack/laroux-react/client.test.ts, pkg/@eserstack/laroux-react/runtime/image/fallback.test.ts, pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.test.ts, pkg/@eserstack/logging/logger.test.ts, pkg/@eserstack/noskills-client/attach.test.ts, pkg/@eserstack/noskills-web/browser-scripts.test.ts, pkg/@eserstack/standards/cross-runtime/adapters/server-websocket.test.ts, pkg/@eserstack/standards/cross-runtime/adapters/web-streams.test.ts, pkg/@eserstack/streams/sinks/process-stream.test.ts, pkg/@eserstack/streams/streams.test.ts, pkg/@eserstack/testing/fake-server.test.ts. Some of these sleeps are the subject of the test (a timer, a rate limit, a delay the code under test makes), which a fake clock or an injected timer serves better than a real wait; others wait for a goroutine or a callback, which a channel, a FIFO, a promise or the end of a close orders exactly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No test asserts a wall-clock duration against a bound below 5 s; what such a bound stood for is checked by a count, an order or an injected clock
- [ ] #2 Every test listed above that sleeps to let another goroutine, callback or process act waits on that act itself (a channel, FIFO, promise, WaitGroup or a close that waits)
- [ ] #3 A test whose subject is time (timers, rate limits, backoff, timeouts) runs on an injected or fake clock where the code under test takes one, and the task notes list the ones where it does not and why
- [ ] #4 The changed Go tests pass 50 runs with -race and -count=50, and the changed TypeScript tests pass 20 runs in a row
- [ ] #5 pnpm ok passes
<!-- AC:END -->
