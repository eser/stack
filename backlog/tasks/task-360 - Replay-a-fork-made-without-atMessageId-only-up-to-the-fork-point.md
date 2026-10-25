---
id: TASK-360
title: Replay a fork made without atMessageId only up to the fork point
status: Done
assignee: []
created_date: '2026-10-25 13:58'
updated_date: '2026-10-25 14:07'
labels:
  - bug
  - noskills-server
dependencies:
  - TASK-359
ordinal: 363000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-359 found that a fork created with an empty atMessageId replays the parent's whole ledger, including lines the parent appended after the fork (replayLedgerFile in pkg/ajan/noskillsserverfx/fork.go). The fork's seq numbers then shift as the parent grows, and the fork now also replays its own fork_created line from the parent. Record the parent's line count at fork time and replay only up to it; start with a failing test that grows the parent after the fork and reconnects the fork with ?after=.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test grows the parent after a fork without atMessageId, and the fork's replay and seq stay fixed (fails before the fix)
- [x] #2 The fork does not replay its own fork_created line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: a fork's header did not record where the fork branched off its parent. forkMeta (fork.go:18-25, before this fix) held only fork_at_message_id; forkSession flushed the parent's ledger 'for a consistent cut point' (fork.go:56-59) but kept no cut; replayWithForkAwareness passed only the message id to replayLedgerFile (fork.go:167), whose loop read the parent file to EOF (for scanner.Scan(), fork.go:214) and stopped early only at that id (:231). With an empty atMessageId, or one the parent does not hold, the fork replayed every parent line, those appended after the fork included, among them the fork_created line forkSession journals in the parent (fork.go:101): the fork's replay and seq numbers grew with the parent, and a reconnect with ?after= got fork lines it already had, renumbered.

Failing test first: TestForkReplayEndsAtTheForkPoint (fork_replay_test.go), three parent lines, fork, the parent grows, the fork gets one line, attach, the parent grows, a live fork event, leave, the parent grows, a missed fork event, reconnect with the last seq seen, then a full replay. Cases: a fork at the parent's tail, at a message, at a message the parent does not hold. Before the fix the tail case replayed [one 1, two 2, three 3, fork_created 4, parent-after 5, fork-one 6] (want [one 1, two 2, three 3, fork-one 4]), the live event got seq 7 (want 5), the reconnect replayed [fork-one 8, fork-two 9, fork-three 10] (want [fork-three 6]); the unknown-message case failed the same way; the message case passed (its stop came before the fork_created line). TestForkReplayReadsTheForkPointFromTheMetadata replays a fork ledger written by hand, as a restarted daemon opens it: with parent_lines 2 and 0 it replayed the whole parent before the fix.

Fix: forkSession records the parent's line count (Ledger.lineCount, ledger.go) in fork_meta as parent_lines before it journals fork_created, so the fork point holds every line the parent has then and none it appends later. replayLedgerFile takes a forkPoint (message id and line count) and stops at the count or after the message, whichever comes first, counting lines as Ledger numbers them (empty lines skipped). The count lives in the fork's ledger header, its first line, so it survives a daemon restart.

Metadata compatibility: parent_lines is a pointer field, written also when 0. A header written before it (no parent_lines) replays as before: to the named message or the parent's end. The header is still read into only the fields replay needs, so its other fields do not have to parse. Tested by the two older-header cases of TestForkReplayReadsTheForkPointFromTheMetadata. README (cmd/noskills-server, Sessions paragraph) now says what a fork replays.

Left open: a fork of a fork replays its parent's ledger file as it is, fork_meta line included, and not the grandparent's history (replayLedgerFile does not follow the parent's own header); this was so before and is outside this task.
<!-- SECTION:NOTES:END -->
