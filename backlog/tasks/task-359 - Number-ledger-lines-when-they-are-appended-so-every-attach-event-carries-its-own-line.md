---
id: TASK-359
title: >-
  Number ledger lines when they are appended so every attach event carries its
  own line
status: Done
assignee: []
created_date: '2026-10-25 13:15'
updated_date: '2026-10-25 13:58'
labels:
  - bug
  - noskills-server
dependencies:
  - TASK-358
ordinal: 362000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-358 made the attach seq count ledger lines, but live seq matches the ledger line number only while every broadcast event is exactly one ledger line in the same order. Four places break that: permission_response_rejected is broadcast but never written to the ledger (wt_attach_dispatch.go dispatchPermissionResponse); fork_created is broadcast to the parent session but never written (fork.go); permission_decision is written but never broadcast (permissions.go); and an event the pump writes between Register and the replay's ledger read in handleAttach is replayed and then sent again live. Have the ledger number each line as it appends it, carry that number on the broadcast event (ledger.go, sessions.go, worker.go), and stamp seq from it in wt_attach.go; events that are not ledger lines carry the current value without advancing it. Start with failing tests for each of the four cases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the four cases has a test showing a reconnect with ?after= gets exactly the missed ledger events, failing before the fix
- [x] #2 Live events carry the ledger line number they were written as, and no event is both replayed and sent live
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the attach seq was a per-connection counter that the live forwarder advanced once per event it sent (wt_attach.go:347 before the fix, *seq++), so live seq matched the ledger line number only while every broadcast event was exactly one ledger line, appended and broadcast in the same order. Four places broke that. (1) dispatchPermissionResponse broadcast permission_response_rejected without writing it (wt_attach_dispatch.go:99 and :113): the client's seq ran one ahead of the ledger and a reconnect skipped the next missed event. (2) forkSession broadcast fork_created to the parent's clients without writing it (fork.go:101): same skip. (3) journalPermissionDecision wrote permission_decision without broadcasting it (permissions.go:139 and :144): the client's seq ran one behind and a reconnect repeated an event. (4) handleAttach registered for live events (wt_attach.go:119) before replayWithForkAwareness read the ledger (fork.go:134, Ledger.Replay reading to EOF), so a line the pump appended in between was replayed and then forwarded again with the next seq. The condition behind all four: the ledger did not number its lines and the event carried no line, so the attach had to guess the number by counting.

Failing tests first: TestAttachEventsCarryTheirLedgerLine (wt_attach_ledger_lines_test.go), one case each: two ledger lines, attach, the case's event, live event three, leave, miss four, reconnect with the last seq seen, then live five. Before the fix: rejected response, reconnect replay empty (want [four seq 5]), next live seq 5 (want 6); fork, the same; permission decision, last seq 4 (want 5), replay [three seq 5, four seq 6] (want [four seq 6]); event journalled while the attach starts its replay, the client got late twice (seq 3 and 4), last seq 5 (want 4), replay empty (want [four seq 5]). Case 4 needs the append between Register and the ledger read, so FanoutBroadcaster has a test seam, onRegister (fanout.go), added before the test and unused in production.

Fix: Ledger numbers lines as it appends them (ledger.go appendLine returns the number; Append and AppendSync keep their signatures) and replayLines replays the lines held when it starts and returns that count. WorkerEvent.Line carries the number (worker.go). SessionEntry.publish (sessions.go) appends and broadcasts under one lock, so clients get events in ledger line order; publishOrSend also broadcasts an event the ledger refused, with Line 0. Every live event goes through it: the pump, the decision, the rejection, fork_created. forwardEvents (wt_attach.go) sets seq from the line (plus the fork offset, the parent lines a forked session replays first less its fork_meta line), drops an event whose line the replay covered (case 4), leaves seq unchanged for Line 0 events and mux frames, and ends the attach with errClientMissedEvents when a line is missing, as when the fanout dropped an event for a full buffer: numbering from lines would otherwise move the client's seq past it for good, while a reattach with ?after= replays it.

Decisions for cases 1 to 3: all three are ledger lines now. permission_response_rejected is journalled: a client answered a request and the daemon did not act, which belongs in the audit trail next to the request, and a client that reattaches sees why its answer had no effect. Because the rejection echoes client input into the ledger, id and decision are clipped to 128 bytes (maxEchoedField, wt_attach_dispatch.go), also in the log. When the rejection itself cannot be journalled (likely when the reason is that the decision could not be), it is still broadcast, unnumbered. fork_created is journalled in the parent: the parent's history records where forks branched off, and a client away at the time learns of the fork on reattach. permission_decision is broadcast after it is journalled, so live clients and replaying clients see the same stream; translateWorkerEvent passes it through (workers set event types in Go code, so an agent cannot forge one). A write-tool decision whose fdatasync fails is not broadcast (the rejection follows), as before. TestMalformedDecisionIsRejectedNotAllowed now checks the ledger holds the rejection and no decision.

Ledger compatibility: the file format is unchanged. Line numbers are not stored; openLedger counts the lines an existing file holds the way Replay sends them (empty and lone CR lines skipped), so ledgers written by older daemons keep their numbering. A last line without its newline, left by an unfinished write, now gets one at open so the next line does not run on from it (the torn line stays a line of its own). appendLine refuses an empty line or one with a newline. Tests: TestLedgerNumbersTheLinesOfAnExistingFile, TestLedgerReplayCoversTheLinesItStartedWith, TestLedgerRefusesALineItCouldNotReadBack, TestForwardEventsEndsAtAMissedLedgerLine; TestForwardEventsDeliversUntilTheChannelCloses covers covered and unnumbered events.

No client changes: they keep the last numeric seq and send it as ?after=. README (cmd/noskills-server, Sessions paragraph) updated.

Left open: a fork made with an empty atMessageId replays the whole parent ledger, including lines appended after the fork (replayLedgerFile reads the parent to its end), so a forked session's seq numbers shift when its parent grows, and it now also replays its own fork_created line from the parent. noskills-client types.ts still says each mux frame is a sequenced ledger entry.
<!-- SECTION:NOTES:END -->
