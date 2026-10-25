---
id: TASK-331
title: Record a fidelity corpus and gate muxfx/vt against xterm.js on it
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 10:05'
labels:
  - mux
  - terminal
milestone: m-8
dependencies: []
priority: medium
ordinal: 334000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server becomes the only emulator, so vt has to render what xterm.js renders for the programs people run in panes. Extend the recorder in etc/temp/muxfx-vt/ (capture-pty.py, record-vt-snapshots.mjs, @xterm/headless 6) and record PTY streams of: Claude Code (start it on a real PTY in a scratch project, open /help, resize, type a prompt without sending it, exit; no model call), vim or nvim (open, edit, split, quit), less over a long file, top, git log with the pager, and a shell session with colors and wide characters. Replay each stream through vt at every recorded size and compare cells, styles, cursor and wrapped rows with the snapshots. Keep the fixture compressed when it passes 900 KB (the golden harness's readRecording/writeRecording pattern). List every difference in the test with its reason; there should be none apart from the documented scrollback case. Fix the vt bugs the corpus finds, each with the stream that shows it. Add a fuzz target for the parser (go test -fuzz) that checks Write never panics and the cursor stays on the screen.

Plan key: T-T1. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The corpus covers Claude Code, vim, less, top, git's pager and a colored shell session at two or more sizes each
- [x] #2 The Go replay compares every cell, style, cursor and wrapped row and runs in make ok
- [x] #3 Every difference from xterm.js is listed in the test with its reason
- [x] #4 A parser fuzz target exists and ran for at least 10 minutes without a finding
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Corpus (pkg/ajan/muxfx/testdata/vt_corpus.json.gz, 18 captures, 131 KB of PTY output, 204 snapshots, 1.37 MB JSON gzipped to 83 KB): Claude Code 2.1.310 at 100x30, 80x24 and 60x20 (trust prompt, /help with tab switching, a long prompt typed and never sent, cursor edits, shift+tab, the / menu, ? shortcuts, three resizes each; no prompt was submitted, Claude was not logged in), vim with syntax, :split and :vsplit at 80x24 and 120x36, less over a 400-line coloured file at 80x24 and 50x15, top (one sleep process) at 100x30 and 70x20, git log -p and --graph through less at 80x24 and 120x30, zsh -f with colours, wide characters and wrapping at 80x24 and 50x16, vim started in zsh after shrinking the pane at 80x24 and 100x30, plus the earlier sh/tput, vim and less streams. Recorded under the neutral path /tmp/vt-corpus (HOME /tmp/vt-corpus/home, Claude Code projects /tmp/vt-corpus/project-<size>), which carries no user name, uid or session id and is removed afterwards; the user name is replaced by a same-length placeholder, and capture-pty.py refuses to write a stream holding the user or host name, a UUID-shaped session id, "claude-<digits>/", "/private/tmp/claude" or "scratchpad". The Claude Code streams were re-captured this way after an earlier recording showed the agent scratch path; a grep for those patterns finds 0 matches in both fixtures. Synthetic fixture vt_snapshots.json now has 94 cases.

Replay (vt/snapshot_test.go) compares every cell's text, width, colours, attributes, underline style and underline colour, the cursor and its visibility, wrapped rows, the alternate screen, input modes and the title, whole writes and byte by byte. TestCorpusCoversThePrograms keeps two sizes per program.

Bugs fixed, each with a fixture regression case: Resize to the current size clamped a pending-wrap cursor (terminal.go Resize); scrolling an alternate screen shrunk while empty did not move ybase, so the first scrolls did not scroll (buffer.go scroll; the vim-after-resize corpus streams show it); Resize filled the empty alternate screen, so entering it later skipped the erase colour (buffer.go normalize); RIS cleared the title (terminal.go resetState); SGR 58/59 underline colour was dropped (cell.go Attrs.UnderlineColor, sgr.go, kept across DECRC); panics: reflowSmaller indexing rows it had just dropped (reflow.go), a REP join after a resize indexing before the row (handlers.go print), reflow copying past a cut wide character (cell.go copyCellsFrom), LineText past a cut wide character (cell.go trimmedText, found by the fuzzer); REP with a huge count allocating gigabytes (found by the fuzzer) and IL/DL/SU/SD/CHT/CBT looping on huge counts are now bounded by the screen with the same result; one cell's combining marks are capped at 256 bytes.

Divergences listed in knownDivergences with reasons and checked by TestKnownDivergences, all xterm.js 6.0.0 defects found by synthetic or random streams (none in the corpus): reflow reaching rows outside its ring buffer at scrollback 0 (the recorder flags these snapshots as staleRows and the replay fails on an unlisted one), a lone zero-width character in the pending-wrap column, SGR 59 giving a white underline, DECALN losing the underline style, RIS keeping the cursor hidden, one-row autowrap recycling the row, reflow moving combined characters it did not copy.

A differential run of about 100k random streams through xterm.js and vt (scratch tooling, not committed) found the bugs above; with the listed classes left out it reports no differences.

FuzzTerminalWrite (vt/fuzz_test.go) seeds from the fixtures, writes, resizes, writes and renders; the two inputs it found are in vt/testdata/fuzz/FuzzTerminalWrite. A final 10m30s run on the fixed code ran 17.7M executions without a finding.

Not done: DECSCUSR cursor shape and OSC 8 links are not compared (vt has neither yet; OSC 8 is TASK-333).

2026-10-25: rtk make ok and deno task cli ok passed. Checked here: both fixtures hold 0 matches for this session's id, uid temp paths or any UUID.
<!-- SECTION:NOTES:END -->
