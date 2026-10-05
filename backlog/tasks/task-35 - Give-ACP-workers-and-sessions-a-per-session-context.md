---
id: TASK-35
title: Give ACP workers and sessions a per-session context
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - noskills
  - go
dependencies: []
references:
  - pkg/ajan/acpfx/session.go
  - pkg/ajan/noskillsserverfx/worker_acp.go
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/acpfx/session.go:208 and pkg/ajan/noskillsserverfx/worker_acp.go:378,392 call SessionUpdate, SetMode and Cancel with context.Background(), because WorkerHandle.SetMode/StopTask and Session.pump have no context. Rule: go-practices context.md: Summary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each session and worker owns a context cancelled on Close, used for these calls
- [x] #2 WorkerHandle methods take ctx where a caller has one
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: Verified: acpfx.Session and acpWorker each own a context built with WithCancel(WithoutCancel(openCtx)) and cancelled by Close. Client.Close closes its sessions. Conn handlers derive from the connection's lifetime context, so the watcher goroutines are gone. SetMode and StopTask take ctx and go through callContext (AfterFunc). wt_attach passes the request ctx. Tests: session_context_test.go and worker_acp_context_test.go. I added reasons to the three new containedctx nolint directives.
<!-- SECTION:NOTES:END -->
