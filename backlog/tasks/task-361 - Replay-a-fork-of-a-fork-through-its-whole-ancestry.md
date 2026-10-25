---
id: TASK-361
title: Replay a fork of a fork through its whole ancestry
status: Done
assignee: []
created_date: '2026-10-25 14:07'
updated_date: '2026-10-25 14:17'
labels:
  - bug
  - noskills-server
dependencies:
  - TASK-360
ordinal: 364000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-360 found that a fork of a fork replays its parent's ledger file as it is on disk: replayLedgerFile in pkg/ajan/noskillsserverfx/fork.go sends the parent's own fork_meta header line as an event and skips the grandparent's history, because it does not follow the parent's header. Follow each ancestor's fork_meta (message id and parent_lines) recursively with a depth bound, never send a fork_meta line as an event, and keep seq numbering consistent with the ledger-line rule from TASK-358 and TASK-359. Start with a failing test that forks a fork and reconnects it with ?after=.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fork of a fork replays the grandparent up to its fork point, then the parent up to its fork point, then its own lines, with no fork_meta line sent as an event (test fails before the fix)
- [x] #2 Ancestry depth is bounded and a cycle or missing ancestor ends the replay with a logged error instead of hanging
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the fork replay read one ancestor only. replayWithForkAwareness (fork.go:164-176 after TASK-360, before this fix) parsed the fork's own header and handed the parent's ledger path to replayLedgerFile (fork.go:176), which sent every line of that file as an event (fork.go:235-246), line 1 included, without checking it for a fork_meta header. So a fork of a fork replayed its parent's header as an event, skipped the grandparent's history, and numbered every line one past where the full history puts it. The stop at atMessageId looked only in the parent's own file, so a fork at a message the parent shows from its own parent never stopped there.

Failing test first: TestForkOfAForkReplaysItsWholeAncestry (fork_ancestry_test.go): root with three lines, fork, the root grows, the parent gets two lines, fork the fork, every ancestor grows, the fork gets one line, attach, ancestors grow, a live event, leave, ancestors grow, a missed event, reconnect with the last seq seen, full replay. Cases: forks at the tails, a parent forked at a message, a fork at a message the parent has from the root, a fork at a message of the parent, a root whose ledger is gone. Before the fix every case failed: forks at the tails replayed [fork_meta 1, p-one 2, p-two 3, f-one 4] (want [one 1, two 2, three 3, p-one 4, p-two 5, f-one 6]), the live event got seq 5 (want 7); the missing root replayed the parent's header as seq 1. TestForkReplayEndsAtABrokenAncestry (missing parent, a fork naming itself as its parent, a cycle above the fork) and TestForkReplayBoundsTheAncestryDepth (exactly maxForkDepth ancestors, one more) were written with the fix and then run against the old replay code: every case failed (header sent as an event, no error, a 33-deep chain replayed as [header, 31, 32]).

Fix (fork_replay.go, the replay code moved out of fork.go): ancestryReplay.replay walks up from fork_meta to fork_meta. For each ancestor it opens the ledger, and when line 1 is a header it first replays that ancestor's parent up to the ancestor's own fork point, then the ancestor's lines; no header is ever sent. Each fork point applies to the whole history of the session it names: parent_lines counts that session's own ledger lines (its header included, as Ledger.lineCount does), and atMessageId stops after the matching line wherever it lies in that history, root lines included. Headers without parent_lines (older daemons) replay that ancestor to its end, as before. The walk breaks at an ancestor whose ledger is missing, at a ledger path already on the walk (a cycle, the fork itself included), or past maxForkDepth (32) ancestors, each recorded as an error wrapping errForkAncestry; the lines below the break are still replayed, numbered from 1. replayWithForkAwareness returns that error after a complete replay, and handleAttach (wt_attach.go) logs it at error level and treats the replay as complete, so the live offset is applied and seq stays the ledger-line numbering on every attach. Scanner buffers start at 64 KiB (1 MiB cap) since up to 32 are open at once. buildLineage stops at the same depth.

Decision: a broken ancestry does not end the fork's own replay. The old code went on with the fork's own lines when the parent was missing, and dropping them would hide a fork's history behind a deleted ancestor. A read error on an ancestor other than a missing file (permissions, a line over 1 MiB) now ends the replay as incomplete, like an error on the fork's own ledger; before it was ignored.

Compatibility: no format change. Old headers are read with the fields replay needs only. A fork of a fork made before this fix gets new numbers once (its history now includes the grandparent and drops the parent's header); a client holding an old seq gets the replay from that seq in the new numbering. README (cmd/noskills-server, Sessions paragraph) describes fork-of-fork replay, the bound and the missing ancestor.

Correction to the line numbers above (fork.go after TASK-360, before this fix): the header is parsed at fork.go:172, replayLedgerFile is called at :177, and its loop sending every line of the parent file starts at :238 (send at :252).

Accepted reading of AC #2: a broken ancestry ends the ancestor walk with a logged errForkAncestry, and the fork's own lines still replay below the break, so a deleted ancestor does not hide the fork's history.
<!-- SECTION:NOTES:END -->
