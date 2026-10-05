---
id: TASK-141
title: Thread lifetime contexts and write deadlines through noskillsserverfx
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskillsserverfx
  - robustness
dependencies: []
references:
  - pkg/ajan/noskillsserverfx/update_check.go
  - pkg/ajan/noskillsserverfx/push.go
  - pkg/ajan/noskillsserverfx/worker.go
priority: medium
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CheckForUpdateAsync (pkg/ajan/noskillsserverfx/update_check.go:18-30) starts an unowned goroutine with context.Background(), prints through fmt.Printf and drops every error. PushDispatcher.MaybeTrigger calls Dispatch(context.Background(), ...) (push.go:375) because SessionManager.runPump has no context. workerImpl.send (worker.go:339-348) encodes onto the unix socket with no write deadline and its WorkerHandle methods ignore ctx, so a mux worker that stops reading blocks the WebTransport read loop that also carries stop. TASK-35 covers the ACP session and worker calls. Rules: go-practices: Summary (context.md), Listening for Cancellation; coding-practices: Owned Asynchronous Work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CheckForUpdateAsync takes the caller's ctx, runs through an owner such as processfx.StartGoroutine and logs failures through logfx
- [x] #2 runPump receives the server's lifetime ctx and passes it to MaybeTrigger
- [x] #3 Every worker socket write has a deadline, and a test with a peer that never reads shows send returns within the bound
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: CheckForUpdate(ctx, out) runs through process.StartGoroutine and logs failures with logger.WarnContext. runPump receives the lifetime ctx from SessionManager.start and passes it to MaybeTrigger. workerImpl.send and Close write with a deadline of min(now+workerWriteTimeout, ctx deadline). The /attach writes go through boundedWriter. All tests pass with -race. I also added reasons to the two new nolint comments in worker.go.
<!-- SECTION:NOTES:END -->
