---
id: TASK-239
title: 'ajan: run blocking FFI calls in worker threads with responsiveness, cancellation and teardown tests'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
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
- [ ] #1 A test runs 8 concurrent one-second blocking calls; during them a 10 ms setInterval drifts by less than 50 ms and an fs.promises.readFile of a small file completes in under 100 ms
- [ ] #2 With 4 PTY panes and an AI stream (fake provider) open, an unrelated fs read completes in under 100 ms (test)
- [ ] #3 A test aborts an in-flight AI request and an in-flight HTTP stream read through AbortSignal; each promise rejects with an AbortError within 1 s and the worker count returns to its idle value
- [ ] #4 A test sends more request and response calls than the pool bound, checks that no more than the bound of pool workers exist at once, and checks that every call completes
- [ ] #5 A test that logs from the main thread checks that the Log calls make no worker message and run synchronously
- [ ] #6 A teardown test runs 50 times (load, start workers, run blocking calls, terminate the workers, exit) and every run exits with code 0 and no signal, in CI on macOS arm64 and Linux
- [ ] #7 A pseudo-terminal test checks that each keypress reaches exactly one reader and that a resize is reported while raw mode is on, and the stdin and SIGWINCH finding is recorded in the ajan README
- [ ] #8 The hard exits are removed, or each one that stays has a comment naming the teardown test that fails without it
- [ ] #9 The ajan README lists the blocking entries, the pool bound and how to change it, and the AbortSignal to cancel-entry mapping
- [ ] #10 A CI workflow job runs the *.ffi.test.ts suites and the worker tests, with a path filter that includes .node-version and every package.json
<!-- AC:END -->
