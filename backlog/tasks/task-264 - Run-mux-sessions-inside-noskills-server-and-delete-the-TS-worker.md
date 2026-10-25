---
id: TASK-264
title: Run mux sessions inside noskills-server and delete the TS worker
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 07:56'
labels:
  - go
  - noskills-server
  - cleanup
milestone: m-5
dependencies:
  - TASK-263
priority: medium
ordinal: 264000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
noskills-server hosts muxfx sessions in-process. Delete the worker spawn and runtime search (worker.go:107-139), NOSKILLS_MUX_WORKER_PATH and NOSKILLS_WORKER_RUNTIME with its fallback, the runtime checks in doctor.go and the noskills-server-worker package. Add both variables to CHANGELOG Migration.

Plan key: M5-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A CI job runs noskills-server mux sessions with no JS runtime on PATH
- [x] #2 pkg/@eserstack/noskills-server-worker is deleted; the gate is green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent, checked here: the CGO_ENABLED=0 noskills-server build and go test -race on noskillsserverfx and shellfx/pty pass).
noskills-server hosts muxfx sessions in-process. SpawnWorker sends kind=mux to spawnMuxWorker, a muxWorker around muxfx.Server that implements WorkerHandle. Removed: the socket listener and process spawn, the workerRuntime search, NOSKILLS_MUX_WORKER_PATH and NOSKILLS_WORKER_RUNTIME, doctor's 'Worker runtime' and 'Runtime dir (0700)' checks, and NSErrors.WorkerRuntimeMissing (503.NS03).
The wire protocol is unchanged:
- the spawn_progress bytes, {type:'mux',v:1,frame} envelopes and SanitizeRemoteTransport on client frames;
- query_start opens a 'claude' tab, and stop/abort end the session;
- wt_attach, fanout and the seq envelope are untouched.
Evidence: TestMuxSessionRunsWithoutAJavaScriptRuntime runs the real daemon over WebTransport (attach, scene, writeInput reaching a stand-in claude with NOSKILLS_SESSION, stop with close code 0 'session_ended'). TestMuxWorkerAnswersAttachWithAFullScene pins the TS diffScene keys. The TS clients pass: noskills-client and webtransport 108, noskills-web 35.
Out of scope but needed: shellfx/pty used cgo openpty, which breaks the CGO_ENABLED=0 release binaries once noskills-server links muxfx. It now opens the pty with system calls (openpty_posix/linux/darwin/other.go, on the existing golang.org/x/sys), with O_CLOEXEC. A Fd() race in resize is fixed via SyscallConn. Both have tests.
AC #1: the CI job mux-no-js-runtime is the patch etc/temp/ci/task-264-ci.patch, applying after 188, 189 and 251 (checked in order on a scratch copy; actionlint shows no new findings). It strips node/deno/bun from PATH, builds with CGO_ENABLED=0, and runs the pty and muxfx tests and the mux session tests, with -race too. It also passed in golang:1.26-bookworm with no JS runtime. It is not in release-gate's needs (owner's choice). Waiting on the owner to apply the patch.
AC #2: pkg/@eserstack/noskills-server-worker is deleted. pnpm-lock.yaml was updated with pnpm install --lockfile-only --offline (230 lines removed: the importer and typescript@7.0.2, which only the worker used); --frozen-lockfile passes. CHANGELOG Migration bullets are added for both variables and the SpawnWorker change. Docs updated: README, ARCHITECTURE, CONTRIBUTING, docs/agents/workflow.md, AGENTS.md (47 packages, 40 libraries). The full gate waits on the TASK-258 work in progress.
Behaviour: StopTask waits for the panes to stop (SIGTERM, SIGKILL after 2 s, bounded at 10 s). ErrWorkerStalled and the 5 s socket write timeout are gone.

2026-10-25: make ok and deno task cli ok passed. Stays In Progress until the owner applies the CI patch for AC #1.

2026-10-25: the owner approved applying the CI patches. etc/temp/ci/task-{188,189,249,251,264}-ci.patch were applied in that order to .github/workflows (build.yml, publish-ajan.yml, update-contributors.yml); actionlint is clean; make ok and deno task cli ok passed. The mux CI job is in build.yml.
<!-- SECTION:NOTES:END -->
