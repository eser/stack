---
id: TASK-357
title: Encode screen runs compactly so screens cost no more bytes than output
status: Done
assignee: []
created_date: '2026-10-25 13:00'
updated_date: '2026-10-25 13:36'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-338
ordinal: 360000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-338 measured the recorded Claude Code session (pty-claude-100x30) over the remote path: 33793 bytes as output messages, 71645 bytes as screen messages (2.12 times). About 48% of the screen bytes are the keys of run objects; "width":1 alone is 16%. Change the run encoding (for example omit width when it is 1 and cells when it equals the text's cell count, or send runs as arrays) in muxfx screen.go, the browser renderer (noskillsserverfx web/static/mux_render.js), the TUI frontend (pane_screen.go) and the fixtures, then tighten TestRemoteMuxBytesForTheClaudeCodeSession's 2.5x limit to the new ratio. ADR 0006 drives: bounded traffic to remote frontends. Plan key: T-T10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Screen messages for the recorded Claude Code session are at most 1.2 times the bytes of output messages, measured by TestRemoteMuxBytesForTheClaudeCodeSession
- [x] #2 The browser renderer, the TUI frontend and FuzzScreenFrames read the new encoding, and the README's example shows it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Wire form (muxfx screen_wire.go, screen_wire_update.go): a run is [text, style, cells, width, cluster, link] without the trailing elements at their defaults (style 0, cells = the text's code points times the width or the width for a cluster, width 1, cluster 0, link 0); a run of blank cells in the default style, width 1, no link, is the bare number of its cells; a screen line is [row, runs] plus 1 when wrapped; a history line is [runs] plus 1 when wrapped. Everything else in the message is unchanged. ScreenRun, ScreenLine and ScreenHistoryLine have MarshalJSON/UnmarshalJSON; the decoders reject wrong shapes, wrong types, negative values, widths other than 0..2 and cluster/wrapped other than 0/1 (ErrScreenRunMalformed, ErrScreenLineMalformed). ScreenUpdate.MarshalJSON and ServerToFrontend.MarshalJSON for screens append to a buffer without encoding/json (no reflection, no compaction pass); strings are escaped as JSON requires, U+2028/2029 escaped, invalid UTF-8 replaced by U+FFFD, <>& left as is. Browser: mux_render.js wireRun/convertLine read the arrays and numbers, clamp cells by the pane, take widths other than 0 or 2 as 1 and skip runs and rows of another shape. TUI: pane_screen.go keeps its bounds (sizes, rows, styles, cells, control characters) on the decoded runs.

Bytes, TestRemoteMuxBytesForTheClaudeCodeSession (pty-claude-100x30 over the remote mux path, 32 lines, 27 screens): before 71645 (2.12x the 33793 bytes of output messages), runs and lines as arrays 39439 (1.17x), plus blank runs as numbers 36233 (1.07x). The budget is now 1.2 (remoteScreenBytesBudget). Fixture testdata/claude_code_screens.json.gz regenerated with -update-screens: 5.4 KB to 4.6 KB gzipped.

Speed, Go 1.26.6, Apple M4 Max: BenchmarkRemoteMuxEncoding over the session's 27 screens (now 34 KB): MarshalJSON 143 us to 52 us (55 allocs), json.Marshal 383 us to 176 us; BenchmarkRemoteMuxClaudeCodeSession 1.12 ms to 1.01 ms; BenchmarkScreenStream 33 to 45 MB/s; BenchmarkScreenCatLargeFile unchanged at 30.6 ms CPU per MiB (the emulation dominates).

Tests: TestScreenRunWireForm (every run kind, defaults, escaping, json.Marshal path), TestScreenRunWireFormReplacesInvalidUTF8, TestScreenWireFormRejectsMalformedInput, TestScreenUpdateWireForm (exact bytes, value and pointer marshal, round trip), TestScreenMessageJSON (updated), FuzzScreenFrames (now encodes every frame to JSON and decodes it before rebuilding the copy; 60 s, 4M execs, no failure), TestPaneScreenPaintsTheWireForm (TUI paints a decoded wire message: control characters replaced, long run cut, bad style and row ignored), browser_scripts.test.ts 'mux-render.js skips runs and rows of a shape the protocol does not have' plus the existing tests and the corpus fixture test in the new form, TestDashboardPaintsTheClaudeCodeCorpus. README Screen Messages example regenerated from a real terminal (shows a bare blank run), run paragraph, lines/history rows and the encoding numbers updated; ADR 0006 status mentions the encoding.

Follow-up after review: mux_render.js fitText cuts a text run's text to the code points that fit in its cells (a run claiming fewer cells than its text could paint past them). Test: 'mux-render.js keeps a run's text inside the cells it claims' (failed before, passes after).
<!-- SECTION:NOTES:END -->
