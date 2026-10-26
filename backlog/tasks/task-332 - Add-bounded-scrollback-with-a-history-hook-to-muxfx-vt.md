---
id: TASK-332
title: Add bounded scrollback with a history hook to muxfx/vt
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 11:25'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-331
priority: medium
ordinal: 335000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lines that leave the top of the normal screen become history: kept compactly as runs of text and style (not one struct per cell), bounded by a line limit (default 5000, configurable per terminal) and by a byte limit. The alternate screen keeps no history. A hook (or a drain method) reports lines added since the last call, so the server can send them. Reflow on resize applies to history as xterm.js does with scrollback. Record new corpus cases with scrollback on and compare with @xterm/headless at the same scrollback; update the documented scrollback-0 difference. Measure the memory of a pane with full history at 120 and 240 columns and record it in the README.

Plan key: T-T2. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 History keeps lines leaving the normal screen, up to the line and byte limits, and none from the alternate screen
- [x] #2 A drain call returns the lines added since the last call, as runs
- [x] #3 Corpus cases with scrollback match @xterm/headless, including reflow
- [x] #4 The README records the measured memory of a full history at 120 and 240 columns
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (pkg/ajan/muxfx/vt): history.go (store and API), runs.go (Run encoding), buffer.go (history in scroll and resize), cell.go (packed lines), terminal.go (options, savedY in whole-list coordinates), handlers.go (ED 3, wrap order), reflow.go (unpacks history groups it re-wraps).

API for TASK-335: vt.WithScrollback(lines) (default vt.DefaultScrollback = 5000; 0 keeps none), vt.WithScrollbackBytes(n) (default vt.DefaultScrollbackBytes = 16 MiB), Terminal.HistoryLen, HistoryBytes, History(from, to) []HistoryLine, DrainHistory() HistoryUpdate{Reset, Lines}: without Reset the lines added since the last call (only the ones still kept when more than the limit arrived), with Reset the whole history after a rewrite (any resize while history exists, ED 3, RIS). Terminal.LineRuns(row) gives a screen row in the same run form; vt.RunCells(runs, cols) expands runs back to cells. vt.Run is Text, Attrs, Width, Cells, Cluster: blank runs (Text ""), text runs (one cell per code point) and cluster runs (one cell); trailing default empty cells are left out. HistoryLine is Runs plus Wrapped.

Storage: history lines are packed (line text in one string plus 40-byte runs with attributes, trailing default cells dropped) in a ring of line structs (80 bytes each) bounded by lines and bytes. The alternate screen has no history. Lines leave the screen into history where xterm.js grows ybase (scroll with scrollTop 0, including a top scroll region); savedY is kept in whole-list coordinates as xterm.js keeps it, so a restored cursor moves up while the history fills and stays once it is full. A resize joins the history to the row list (same algorithm as before, with maxLength rows + scrollback), so history re-wraps with xterm.js's reflow, a narrower screen pushes rows into history and a taller one takes them back, then splits it again; only wrapped groups the reflow touches are unpacked. ED 3 clears history (xterm.js keeps savedY there too).

Measured memory (BenchmarkHistoryMemory, 40-row pane, 5000 lines, Go 1.26 darwin/arm64), recorded in the muxfx README: 120 cols plain 1.7 MB, short shell lines 1.4 MB, code with 8 colour runs 2.8 MB, a colour per cell 17.5 MB (byte limit stops at 3355 lines); 240 cols 2.5 / 1.7 / 3.5 / 17.7 MB (1691 lines). One Cell per column would be 33.6 MB at 120 and 67.2 MB at 240 columns.

Write path (2000 coloured lines into a 120x40 pane, steady state): before this task 44 MB/s without history. Packing alone cost 0.6 us/line (33 MB/s); reusing the row that leaves the list as the next blank row (buffer.spare) and a fast path in the packer bring it to 75 MB/s at scrollback 0 and 54 MB/s at the default 5000.

Corpus and fixtures: the recorder (etc/temp/muxfx-vt/record-vt-snapshots.mjs) takes a per-case scrollback and snapshots the history like the screen; the Go replay gives vt the same limit (absent = 0, so the old fixtures replay at scrollback 0 unchanged). Every PTY capture is now also recorded as <name>-scrollback at 200 lines (20 new corpus cases); two new captures pty-shell-scroll-80x24 and pty-shell-scroll-120x30 (cat of a 400-line coloured file, git log without a pager, background erases, resizes, clear sending ED 3), recorded under /tmp/vt-corpus; their scrollback variants fill the 200-line history, drop lines, re-wrap it narrower and wider and clear it. 16 new synthetic cases with scrollback (history-*: scroll into history, full history, saved cursor while filling and when full, wide/styles/erase, reflow narrow/wide, cursor group spanning history, reflow past the limit, rows grow and shrink, ED 3, alternate screen keeps none, scroll regions, RIS and DECSTR, one-row autowrap, a combining char widening at wrap) plus resize-reflow-wide-chars-scrollback. Fixtures: vt_snapshots.json 111 cases, vt_corpus.json.gz 40 cases (241 KB gzipped). Privacy grep on the corpus: 0 matches.

Divergences: resize-reflow-wide-chars (scrollback 0) now explains that with history the row goes into it and xterm.js agrees (resize-reflow-wide-chars-scrollback matches). New: ed1-unwraps-a-history-line, an xterm.js 6.0.0 defect: ED 1 in the last column clears lines.get(y + 1) without ybase, so with history it unwraps a history line (and throws on the bottom row at scrollback 0); vt unwraps the screen row below the cursor. The recorder no longer flags xterm.js's harmless lookahead read in reflowLargerGetLinesToRemove as a stale row.

Differential runs (scratch, not committed: random streams through xterm.js and vt via the recorder's new --cases mode): 2 x 20000 streams at scrollback 0-50 with resizes. Found and fixed a pre-existing panic: growing an alternate screen that was shrunk while empty and filled since appended rows past its list (xterm.js's circular list drops its top row there); regression test TestGrowingAFilledShrunkAlternateScreen. With ED 1 left out, the remaining 20 differences of 19996 are the listed one-row autowrap and reflow-of-combined-characters classes.

Fuzz: FuzzTerminalWrite now derives a history limit (0-18) from its split input (saved inputs keep working), checks the history limits, row runs round-tripping to cells and drain sizes. 10 minute run: 10.59M executions, no finding.

Gates: go test -race -count=1 ./pkg/ajan/muxfx/... ok; golangci-lint run ./pkg/ajan/muxfx/... 0 issues; make ok passed.
<!-- SECTION:NOTES:END -->
