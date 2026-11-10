---
id: TASK-385
title: 'ci: fix the first main run failures before 5.0.0'
status: In Progress
assignee: []
created_date: '2026-11-10 09:00'
updated_date: '2026-11-10'
labels:
  - ci
  - bug
milestone: m-2
dependencies: []
priority: high
ordinal: 388000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first Integrity Pipeline run (.github/workflows/build.yml) of main at 2c520a07 failed in three jobs while `pnpm ok` passed locally. Every job behind Validate was skipped, so this run says nothing about them.

Validate, `tests`: `pkg/@eserstack/ajan/wasm/loader-reactor.test.ts:174`, "warm calls cost microseconds on one instance", failed with `median 0.1202 ms is over 0.1 ms`. Root cause: the test asserted a wall-clock median under 0.1 ms. A laptop measures about 25 us; the shared runner, with the full gate running other suites in parallel, measured 120 us in all three rounds.

Validate, `go-tests`: `TestReleaseContract` (pkg/ajan/codebasefx/release_test.go:293, `runGit "commit": Author identity unknown`) and `TestRereleaseAndUnrelease` (:368, `CreateTag "v1.2.3": runGit "tag": Committer identity unknown`). Root cause: the test helper `git` (release_test.go:24) passes `GIT_AUTHOR_*` and `GIT_COMMITTER_*` to the commands it runs itself, but the release commit (pkg/ajan/codebasefx/release.go:210 through `runGit`, git.go:23) and the annotated tag (`CreateTag`, git.go:165) inherit the process environment. On a machine with a global git identity they pass; the CI runner has none, and git cannot guess an email from its host name.

Windows Smoke Test, `go test ./...` in pkg/@eserstack/ajan: `TestBridgeConfigFiles` and `TestBridgeConfigDotenvFiles` answered `invalid request JSON: invalid character 'U' in string escape code`. Root cause: pkg/@eserstack/ajan/bridge_config_test.go built every request by pasting the temporary path into JSON text (:51, :56, :62, :69, :90, :95, :104-109), so `C:\Users\...` became an invalid escape. The same log shows `eser-ajan: recovered panic: runtime error: index out of range [3] with length 0`; it comes from the case "converts runtime index out of range into error envelope" of `TestGuardString` (pkg/@eserstack/ajan/panic_guard_test.go:57), which raises that panic on purpose and passed, like the other recovered panics in the log (`TestReportPanic`, `TestGuardVoid`, `TestEserAjanCallRecoversAPanickingHandler`).

Mux Sessions (no JS runtime): cancelled by its 10 minute job timeout, which equals the default `go test` timeout, so no goroutine dump was printed. The `CGO_ENABLED=0` runs passed; the `go test -race` run of noskillsserverfx (build.yml:190) hung, leaving `noskillsserverfx.test` and the `flood` script of `TestMuxWorkerCloseReturnsWhileNobodyReads` running. A dependabot run of the same day hung the same way. Reproduced in a linux/arm64 golang:1.26.10 container, where the dump shows the test goroutine inside `SendMux` (pkg/ajan/noskillsserverfx/worker_mux_test.go:379), drafted as the drainer of the mux server, applying pane output. Root cause, pkg/ajan/muxfx/server.go: `post` (:313) makes a caller that finds the queue idle apply it (:331), and `drain` (:334) runs until the queue is empty. A pane that writes faster than the server applies its output refills the queue through its reader (`OnData`, :233, which waits at :316 only for a slot), so the queue never empties and the `Dispatch`, `Connect` or frontend message of that caller never returns. The race detector slows the terminal emulation enough for `while :; do echo flood; done` to outrun it on Linux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reactor timing test keeps its intent, a warm call is far cheaper than an instantiation, with a bound that a shared runner meets and that a call ten times slower still fails
- [x] #2 `TestReleaseContract` and `TestRereleaseAndUnrelease` pass with no global or system git identity, without a change to production code; every Go and TypeScript test that commits or tags was checked for the same assumption
- [x] #3 A test written first reproduces the Windows JSON error on macOS with a path that holds a backslash and a quote; the bridge config tests encode their requests as JSON, and every other bridge test that put a path into JSON text does too
- [x] #4 The recovered `index out of range [3]` panic in the Windows log is traced to its test
- [x] #5 A test written first hangs on the mux server drain while a pane floods; the fix is in muxfx, and the commands of the Mux Sessions job, the `-race` run included, pass in a linux/arm64 container
- [x] #6 `pnpm ok` passes
- [ ] #7 The Integrity Pipeline run of main after the push is green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reactor timing (AC1), pkg/@eserstack/ajan/wasm/loader-reactor.test.ts: the median bound is 1 ms (`medianBoundMs`, :164) and the p99 bound stays 10 ms, each named once and used by the retry rounds and the assertions (:185, :189). 1 ms is about 8 times the CI reading and 40 times a laptop's, and ten times the old 0.1 ms, so a warm call that got ten times slower than the old budget still fails; a call that instantiated the module again costs the load time, about 35 ms. A baseline measured in the same process was considered and left out: the load time it would compare against varies on a shared runner as much as the call does.

Git identity (AC2): `changelogRepo` (pkg/ajan/codebasefx/release_test.go:173), which `releaseRepo` builds on, sets `user.name` and `user.email` in the fixture repository (:183-184), so the commit and tag that `runGit` runs find an identity whatever the process environment holds; production code is unchanged. Reproduced first: the root Go module with `HOME` pointed at an empty directory, `GIT_CONFIG_SYSTEM=/dev/null` and `GIT_CONFIG_GLOBAL` at a file holding only `user.useConfigOnly = true` (macOS would otherwise guess an email from its host name) failed exactly these two tests with the CI messages, and passes after the change; the bridge module passes in the same environment. The other tests that commit or tag already set an identity: release_artifacts_test.go:458 passes `-c user.name`, the codebasefx phase tests and changelog format test set `GIT_*` on their own commands, and in TypeScript pkg/@eserstack/codebase/release.test.ts passes `-c user.name` and pkg/@eserstack/noskills/commands/git-wrapper.test.ts runs `git config user.name`; the TypeScript suite passed on CI.

Bridge JSON (AC3), pkg/@eserstack/ajan/bridge_config_test.go: `configTestDir` (:20) answers a temporary directory named `C:\Users\runner "quoted"` on platforms that allow it, and the temporary directory itself on Windows, whose paths carry backslashes and refuse quotes. With it and the old requests, both tests failed on macOS with the Windows message. `configRequest` (:49) encodes every request with `json.Marshal`. The parse cases are now a slice, so the request printed on failure is the one sent. The load case keeps `dir+"/.env"`: `LoadDotenv` joins with a slash on every platform (pkg/ajan/configfx/envparser/dotenv_load.go:146). The search for paths in JSON text across the bridge tests found one more, `TestUnknownValidatorIsRejected` (pkg/@eserstack/ajan/bridge_handle_safety_test.go:316), which used Go's `%q`, not JSON quoting for every string; it now uses `json.Marshal`. The other `%q` and concatenated requests carry handles only.

Panic (AC4): the panic is the deliberate `s[3]` of `TestGuardString` (pkg/@eserstack/ajan/panic_guard_test.go:57), which checks that `guardString` turns a runtime panic into an error envelope; the case passed, so nothing changed there.

Mux drain (AC5): `TestServerDispatchReturnsWhileAPaneFloods` (pkg/ajan/muxfx/server_test.go:471) spawns a pane through `floodHost` (:420), whose output is already queued when `Spawn` returns and never stops until `KillAll`. Before the fix its `Dispatch` of newTab did not return in 10 s, on macOS without the race detector. Fix in pkg/ajan/muxfx/server.go: a caller drafted by `post` (:324) applies at most `drainBudget` events (:24, one full queue), then `drain` (:349) hands the rest to a goroutine of the server's own (:364) that applies the queue until it is empty (`drainAll`, :28). The draining flag stays set across the handover, so events are still applied one at a time in posting order, and a caller that is not held by a flood still finds its events, and those they cause, applied when it returns, which `TestServerReentrantFrontend` and the session tests rely on. The muxfx suite passes with `-race`; in the linux/arm64 container the job's three commands pass, the `-race` run of noskillsserverfx in about 11 s where it had hung. Repeated there with `-race`, 5 rounds of the mux tests and 20 of the muxfx server tests passed.

`pnpm ok` passes (AC6). AC7 needs the owner's push of these changes; the jobs that Validate gates (Release Preflight, the cross-runtime, npm and laroux smoke tests) and the Windows steps after the ajan module tests did not run on 2c520a07, so that run is their first.
<!-- SECTION:NOTES:END -->
