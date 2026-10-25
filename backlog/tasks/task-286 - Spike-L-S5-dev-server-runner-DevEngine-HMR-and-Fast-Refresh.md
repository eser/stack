---
id: TASK-286
title: 'Spike L-S5: dev server runner, DevEngine HMR and Fast Refresh'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - spike
  - track-l
milestone: m-7
dependencies:
  - TASK-189
priority: high
ordinal: 286000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes S6, S7, SA8 and S-I9 (decision-51: HMR and Fast Refresh ship in R1).
- S6: 200 scripted edits on the L-S1 app with a worker swap, moduleRunnerTransform with an in-house evaluator, and import(?v=). Measure RSS and heap, p50 and p95 edit-to-response latency, and singleton correctness. Check request and response body transfer, abort propagation, backpressure and SSE cutoff across the worker MessagePort.
- S7: rolldown's DevEngine standalone behind laroux's own HTTP server and WebSocket, a DevRuntime with import.meta.hot (accept, dispose, data, invalidate, prune, on, send), Fast Refresh both in the RSC pre-transform and through transform.jsx.refresh, state kept across an edit.
- SA8: action HMR with flags changes (stub re-emit), named and anonymous inline actions, proxy.ts hooks and middleware.
- S-I9: an edit under a dehydrated island, the dev hold policy for module URLs, island edit state, Defer refetch, directive-change invalidation, token validity across rebuilds.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-311.

Plan key: L-S5. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S6 records the measurements and picks the server runner
- [ ] #2 S7 shows state kept across a client component edit with DevEngine, or records why the decision-51 fallback is needed
- [ ] #3 SA8 and S-I9 results are recorded with the scripted edit list
- [ ] #4 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
