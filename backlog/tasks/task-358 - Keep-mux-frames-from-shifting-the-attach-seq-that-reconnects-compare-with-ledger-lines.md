---
id: TASK-358
title: >-
  Keep mux frames from shifting the attach seq that reconnects compare with
  ledger lines
status: Done
assignee: []
created_date: '2026-10-25 13:00'
updated_date: '2026-10-25 13:36'
labels:
  - bug
  - mux
milestone: m-8
dependencies:
  - TASK-338
ordinal: 361000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-338 found that on /attach mux frames advance the per-connection seq, and a reconnect with ?after=<seq> compares that seq with ledger line numbers (wt_attach.go, wtSend and the replay). A client that reconnects after mux frames can therefore skip or repeat ledger events. Confirm with a failing test, then give mux frames their own sequence or make ?after= count only ledger lines; document the rule in cmd/noskills-server/README.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test reconnects with ?after= after mux frames and gets exactly the ledger events it missed
- [x] #2 The README states what ?after= counts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (wt_attach.go before this fix): the per-connection seq counted every line sent, not ledger lines. forwardEvents did *seq++ for each mux frame (wt_attach.go:340-341), and wtSend incremented seq for every map message (wt_attach.go:377-382), so transcript_replay_start (:132) and transcript_replay_end (:172) took a seq too; replay lines carried their ledger line number (:148, :154), and live events continued from the inflated counter. A client's last seq therefore ran ahead of the ledger: a reconnect with ?after= skipped one missed event per attach on an agent session (replay_end) and one per mux frame on a mux session. replay_start also reset a reconnecting client's seq to 1, and an ?after= past the ledger's end numbered live events from the client's value.

Failing test first: TestAttachReconnectGetsExactlyTheMissedLedgerEvents (wt_attach_seq_test.go), agent and mux session, two replayed lines, live events between mux frames, disconnect, two events missed, reconnect with the last seq seen. Before the fix: agent session lastSeq 5 (want 4), replay [six] (want [five six]), next live seq 8 (want 7); mux session lastSeq 9 (want 4), replay empty (want [five six]), next live seq 9 (want 7).

Fix: seq is the number of the last ledger line the client has been sent. It starts at ?after= (wt_attach.go:111), replayed lines carry their line number, it is set to the ledger's line count after a complete replay (:172, so an ?after= past the end goes back to it), and each live event advances it (:347); mux frames (:353), replay_start and replay_end carry it unchanged (wtSend takes the value, :390). Every line keeps a seq that never goes back, so no client changes: noskills-client attach.ts, noskills-web mux-remote.js and noskillsserverfx web/static/mux_remote.js keep the last numeric seq and send it as ?after=. Also TestAttachAfterBeyondTheLedgerGoesBackToItsEnd. README (Sessions paragraph) states what seq and ?after= count.

Left open, outside this task's files: live seq equals the ledger line number only while each broadcast event is one ledger line in the same order. Not so for permission_response_rejected (wt_attach_dispatch.go:99, :113, broadcast, not journaled), fork_created (fork.go:101, broadcast to the parent, not journaled), permission_decision (permissions.go:139, :144, journaled, not broadcast), and events the pump appends between Register (wt_attach.go:115) and the replay's read of the ledger (replayed and then forwarded again). The origin fix for those is the ledger numbering lines at Append and the event carrying that number (ledger.go, sessions.go, worker.go). noskills-client types.ts still says each mux frame is a sequenced ledger entry.

Correction: Register is at wt_attach.go:119 after this fix (115 before).
<!-- SECTION:NOTES:END -->
