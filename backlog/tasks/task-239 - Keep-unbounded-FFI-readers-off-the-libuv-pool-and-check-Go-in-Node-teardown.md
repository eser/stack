---
id: TASK-239
title: 'ajan: run blocking FFI calls in worker threads with responsiveness, cancellation and teardown tests'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 18:00'
labels:
  - ffi
  - ajan
  - mux
milestone: m-2
dependencies:
  - TASK-238
priority: medium
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision ffi-on-node, node:ffi calls are synchronous only, so a call that can block runs in a `node:worker_threads` worker. The worker opens the library with its own `dlopen`, makes the synchronous call and answers by message, so the main event loop stays free. The M0-T2 measurements are the baseline.

Blocking entries in the M2-T7 binding table (blocking flag set):
- the 8 AI calls: AiGenerateText, AiStreamText, AiStreamRead and the five AiBatch calls
- HttpRequest, HttpRequestStream and HttpStreamRead
- ShellExec and ShellExecRead, ShellPtyRead and ShellTuiKeypressRead
- the network-backed kit and posts calls: KitListRecipes, KitApplyRecipe, KitCloneRecipe, KitNewProject, KitUpdateRecipe, PostsCompose, PostsGetTimeline and PostsSearch

Execution:
- One dedicated worker per long-lived reader: each PTY pane, each AI stream, each HTTP stream, each exec reader and the keypress reader. The worker ends when its handle closes.
- A bounded pool for request and response calls. Document the bound and how to change it in the ajan README.
- Short calls stay synchronous on the main thread: Version, Init, Free, the Log calls, AiCancelRequest, the Close and Free calls, PTY write, resize and kill, TUI size and the in-memory crypto, formats and parsing calls.
- An AbortSignal makes the main thread call the matching cancel or close entry (AiCancelRequest, HttpStreamClose, ShellExecClose, ShellPtyKill, ShellTuiKeypressClose), which ends the blocked Go call; the worker's promise then rejects with an AbortError.
- Verify under Node that pin_image (RTLD_NODELETE in pin_image_posix.go and pin_image_windows.go) keeps a second `dlopen` in a worker safe.

Also check:
- Whether the teardown hard exits are still needed under Node (codebase/cli-support.ts:160-170, workflows/main.ts:51-57, if those files still exist). Remove them if they are not.
- Whether Go reading os.Stdin (bridge.go:5545) and signal.Notify(SIGWINCH) (shellfx/tui/sigwinch_unix.go:23) conflict with Node's raw mode. If they do, move keypress, raw mode and size handling to process.stdin.setRawMode, readline.emitKeypressEvents and the stdout resize events.

Update the callers in shell, ai, httpclient, kit and posts, one commit per package (cross-package notes). Add a CI job that runs every *.ffi.test.ts suite and these worker tests, and make it run on any change to .node-version or a Node engines range, so a Node minor bump cannot merge without it (decision-14).

Decisions this task waits on: decision-37 (FFI mechanism on Node).

Plan key: M2-T8. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test runs 8 concurrent one-second blocking calls; during them a 10 ms setInterval drifts by less than 50 ms and an fs.promises.readFile of a small file completes in under 100 ms
- [x] #2 With 4 PTY panes and an AI stream (fake provider) open, an unrelated fs read completes in under 100 ms (test)
- [x] #3 A test aborts an in-flight AI request and an in-flight HTTP stream read through AbortSignal; each promise rejects with an AbortError within 1 s and the worker count returns to its idle value
- [x] #4 A test sends more request and response calls than the pool bound, checks that no more than the bound of pool workers exist at once, and checks that every call completes
- [x] #5 A test that logs from the main thread checks that the Log calls make no worker message and run synchronously
- [ ] #6 A teardown test runs 50 times (load, start workers, run blocking calls, terminate the workers, exit) and every run exits with code 0 and no signal, in CI on macOS arm64 and Linux (passes locally on macOS arm64; waits on the first ffi-workers.yml run for both CI rows)
- [x] #7 A pseudo-terminal test checks that each keypress reaches exactly one reader and that a resize is reported while raw mode is on, and the stdin and SIGWINCH finding is recorded in the ajan README
- [x] #8 The hard exits are removed, or each one that stays has a comment naming the teardown test that fails without it
- [x] #9 The ajan README lists the blocking entries, the pool bound and how to change it, and the AbortSignal to cancel-entry mapping
- [ ] #10 A CI workflow job runs the *.ffi.test.ts suites and the worker tests, with a path filter that includes .node-version and every package.json (ffi-workers.yml is written; waits on its first CI run)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26, Node 26.12.1, macOS arm64. Design: ffi/offload.ts runs the names the binding table marks blocking in node:worker_threads workers (ffi/offload.worker.ts) that dlopen the library through backend-node's openTransport and answer one job at a time by message. Request and response calls go to a pool bounded at 8 (ESER_AJAN_POOL_SIZE, then LoadOptions.poolSize, 1 to 64, RangeError otherwise); a call that finds every worker busy queues, a worker idle for 30 s ends, and a worker that dies while calls wait is replaced. Each blocking stream gets a dedicated worker for its reads, and for its open when the open waits on the network (aiTextStream, httpRequestStream are async); the shell stream opens are spawns and stay synchronous, so spawnChildGoSync keeps its pid. The reader worker ends when the stream closes or reads null. Workers are unref'd while idle and ref'd while a job is in flight, start with --no-warnings (node:ffi's ExperimentalWarning prints once, on the main thread) and fall back to inline calls when a worker cannot start (--permission without --allow-worker). Everything else stays synchronous on the main thread (lib.workers().posted proves the Log calls post nothing).

Binding table: blocking calls are async: true (they answer promises), StreamBinding has a Blocking type parameter so blocking stream reads type as promises, and each cancellable entry carries cancel: aiCancelRequest (the AI generation, its stream and the five batch calls; the library adds a requestId when the request has none, without mutating the caller's object), close (httpRequestStream, shellExecStream, shellTuiKeypressStream) or shellPtyKill (SIGKILL). call, stream and read take { signal } last; an abort runs the cancel entry on the main thread and rejects with signal.reason; an already-aborted signal sends nothing. Blocking names without a cancel entry (httpRequest, shellExec, kit, posts, workflowRun) reject at once while their worker finishes the Go call. lib.close() runs the in-flight cancel entries, ends the workers and fails what was in flight; an exit hook (globalThis.process?.once("exit"), as ffi/resolve.ts reads process) runs the in-flight cancel entries when a process exits with the library open: without it, process.exit() with a PTY read blocked in Go waited for the PTY's child (8 s in a scratch run, unbounded for a child that never exits), with it the exit is immediate. The blocking-name list adds workflowRun, which the table already marked blocking.

Measured (macOS arm64, idle machine): 8 one-second shellExec calls in workers, max timer lateness 10.8 ms, readFile 0.4 ms, 1.17 s for the 8; the same calls on the main thread, 8.2 s lateness (the AC #1 test fails on that path). Inside the full gate (all test files plus the Go tests at once) the shellExec variant saw 1.18 s of lateness and 4.5 s for the calls: eight concurrent fork()s of a large, coverage-instrumented process on a saturated machine stall it, so AC #1 uses httpRequest to a local endpoint that answers after 1 s, which forks nothing.

pin_image: the teardown test closes the main thread's handle before the workers end, so the last handle goes away in a worker's teardown, the case the M0-T2 spike saw hang without RTLD_NODELETE on macOS; no Go change was needed.

stdin and SIGWINCH (AC #7): measurement (d) of TASK-175 stands (Node's first touch of process.stdin reopens the tty and silently ends Go's os.Stdin reader, on macOS blocking the main thread; SIGWINCH reaches whichever side installed its handler last), so the keypress, raw mode and size handling moved to Node: shell/tui/terminal-input.ts (readTerminalEvents over runtime.process.stdin, runtime.process.setStdinRaw through withRawMode, the SIGWINCH listener and runtime.process.consoleSize) replaces tui/keypress-go.ts and its readKeypressFFI, setStdinRawFFI and getTerminalSizeFFI exports, which nothing in the repo used. One terminal owner per process; each key goes to the reader opened last; stdin is read only while a reader waits, because a read left open after the last reader keeps the process alive (found while writing the test: a read-ahead pump hung the child's exit). The finding is in the ajan README, "Terminal input under Node". The Go keypress names stay for hosts where Go alone owns the terminal; their close stays synchronous per this task and can wait up to closeWaitTimeout (2 s).

Hard exits (AC #8): both removed. Neither the SIGSEGV reason (no signal in 150 local teardown runs here, plus M0-T2's 1,040 and 1,220) nor a stdin reason holds: the prompts' readKeypress releases stdin with no read in flight, and a child that read a key that way exits on its own. workflows/main.ts sets the exit code (main-exit.ffi.test.ts: 10 runs of pass and fail workflows exit 0 and 1 with no signal); codebase exitCli and runStandaloneModule set the code and return Promise<void> (cli-support-exit.ffi.test.ts: after a prompt read in a PTY and a pool call, the child exits on its own with exitCli's code 4). Twelve CLI entry commands (eser --help, version, ajan version, codebase validate-eof and validate-licenses, an unknown command, workflows list, bin.ts, codebase main, noskills and laroux bin-main, validation) exited on their own with the right codes.

Callers: shell (runExecGo and CommandBuilder's native spawn await shellExec; the exec stream pump serializes reads and reads until its own stream gets a chunk; the PTY pump awaits worker reads), ai (calls and the stream pass { signal } to the library, its own bindAbort is gone, tests moved to the fake library), httpclient (the request signal reaches the call, the open and each body read; on WASM an abort now rejects with AbortError instead of a GoHttpError "request aborted"), kit (five handlers await), posts (three methods await). WIRING and README updates in ajan, shell and httpclient; CHANGELOG migration entries for ajan, shell, codebase and httpclient; .github/workflows/ffi-workers.yml (ubuntu-24.04-arm and macos-latest, paths .node-version, **/package.json, the lockfile and workspace, go.mod, go.sum, Makefile, pkg/** and itself) runs every *.ffi.test.ts suite and the bindings, library and offload unit tests; docs/agents/release-and-ci.md and .github/ARCHITECTURE.md list it.

Tests: ajan ffi/workers.ffi.test.ts (AC #1 to #5), ffi/teardown.ffi.test.ts (AC #6: 50 runs, 5 at a time, even runs close then exit naturally, odd runs exit with a PTY read in flight; 50 of 50 exit 0 with no signal on macOS, about 9 s), ffi/library.test.ts (routing, abort mapping, close), ffi/bindings.test.ts, ffi/offload.test.ts, mod.test.ts (pool size); shell tui/terminal-input.ffi.test.ts (AC #7); codebase cli-support-exit.ffi.test.ts and workflows main-exit.ffi.test.ts (AC #8). AC #6 on Linux and AC #10's run wait on the first CI run of ffi-workers.yml. pnpm ok: all checks passed.

Open: httpRequest has no Go-side cancel on the native library (its worker runs to timeoutMs after an abort); a requestId-keyed cancel in bridge_http.go would give it one. A readTerminalEvents reader that ends by abort while it waits leaves one stdin read open, which keeps the process alive.
<!-- SECTION:NOTES:END -->
