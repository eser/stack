---
id: TASK-213
title: 'mux, noskills-server-worker and the daemon worker runtime search'
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - mux
  - noskills-server
  - go
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In mux and noskills-server-worker:
- Change the mux-worker.test.ts:15-20 spawn to node.
- Remove `deno run -A` and the NOSKILLS_WORKER_RUNTIME deno preference from the noskills-server-worker README.
In pkg/ajan/noskillsserverfx:
- Remove deno and bun from workerRuntime (worker.go:110-135, including :113 and :128), the doctor checks (doctor.go:129-148) and the error text (errors.go:72-78).
- When NOSKILLS_WORKER_RUNTIME is deno or bun, log a warning naming the change and fall back to node instead of failing. Record this for M1-T36.
- Update worker_runtime_test.go and cmd/noskills-server/README.md:86.
One commit per package or module.

Decisions this task waits on: decision-15 (Keep Bun support).

Plan key: M1-T19. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test` passes for mux and noskills-server-worker
- [ ] #2 `git grep -wni 'deno\|bun' pkg/@eserstack/mux pkg/@eserstack/noskills-server-worker pkg/ajan/noskillsserverfx cmd` matches only the fallback warning and its test
- [ ] #3 `make ok` passes; a worker smoke test starts mux-worker.ts under node, and a test covers the deno and bun fallback
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: mux 9 of 9 files (72 tests). noskills-server-worker 2 files, 1 pass, 1 fail (21 tests pass, 4 fail): mux-worker.test.ts:15-20 spawns `execPath() run`, so 2 tests fail with "Cannot find module .../run" and 2 time out after 15 s waiting for the ready handshake.
- Source: 0 Deno, Bun or specifier uses in both packages.
- Go: pkg/ajan/noskillsserverfx/worker.go (15), worker_runtime_test.go (6), doctor.go (3), errors.go (3).
- Docs: cmd/noskills-server/README.md (1), pkg/@eserstack/noskills-server-worker/README.md (9).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-213 (2026-10-25): commit 7d958e2f (the Go port of noskills) landed after the spike and removed most of this task's targets: pkg/@eserstack/noskills-server-worker (mux-worker.ts, its tests and README), worker_runtime_test.go and the workerRuntime search. The daemon runs mux and agent sessions in-process, reads no NOSKILLS_WORKER_RUNTIME and starts no JavaScript runtime, and the CHANGELOG already tells users to drop the variable. A deno or bun fallback warning and a worker smoke test under node have nothing left to cover.
- Changed: mux examples/demo.ts run line to `node`; mux ipc/transport-ws.ts comment names runtime.http.upgradeWebSocket; noskillsserverfx README says `node --test`; the globals comment in web/static client.js, mux_remote.js and mux_render.js names the test stand-ins instead of deno lint; mux_session_test.go checks only node off PATH.
- node --test --test-force-exit on mux: 72 of 72 pass. tsc shows no mux error; oxlint and oxfmt --check are clean on the changed files.
- go vet and go test -count=1 on ./pkg/ajan/noskillsserverfx/... pass; golangci-lint on it reports 0 issues.
- AC #2: the grep (run with `--` because noskills-server-worker is gone) still matches cmd/eser (README.md, app_test.go, cs_test.go, kit_parity_test.go) and cmd/noskills (README.md, app_test.go, run_binary_test.go, state_commands.go). These are parity tests against the TypeScript CLI under deno and example strings, outside this task.
- AC #3: `make ok` fails outside this scope while the cutover is mid-edit (cmd/eser TypeScript parity tests, codebasefx release parity and code-conventions baseline, workflowfx recipe manifests); noskillsserverfx passes in it.
<!-- SECTION:NOTES:END -->
