---
id: TASK-333
title: 'Move muxfx/vt to Unicode 15.1 widths, grapheme clusters and OSC 8 links'
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
ordinal: 336000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
vt follows xterm.js's Unicode 6 tables because a browser xterm.js had to agree with it; after ADR 0006 nothing does. Generate width tables from Unicode 15.1 (EastAsianWidth, emoji presentation, zero-width and combining marks) with a go:generate script that records the data version, and keep a grapheme cluster (UAX #29: ZWJ sequences, flags, skin tones, variation selectors) in one cell with its width. Store OSC 8 hyperlinks per cell through a link table (id and URI, bounded), cleared by OSC 8 with an empty URI. Corpus cases that change because of this are re-recorded against a reference that implements the same tables (check what @xterm/headless with the unicode-graphemes addon gives, and use it if it matches; otherwise hand-checked expected screens), and listed.

Plan key: T-T3. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Width tables are generated from Unicode 15.1 data by a script that records the version
- [x] #2 Emoji ZWJ sequences, flags, skin tones and combining marks occupy the cells a modern terminal gives them, with tests
- [x] #3 OSC 8 links are stored per cell and cleared, with a bounded link table
- [x] #4 Every corpus case that changed is listed with the reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (pkg/ajan/muxfx/vt): gen_unicode_tables.go (go:build ignore generator; go:generate in width.go), unicode_tables.go (generated, 1910 property ranges, 50 KB, records unicodeVersion = "15.1.0"), unicode_grapheme_cases_test.go (generated, 1187 GraphemeBreakTest.txt cases, 32 KB), width.go (properties, UAX #29 segmenter, cluster widths), handlers.go (print joins clusters, joinCell, keepZeroWidth), links.go (OSC 8), cell.go/runs.go/terminal.go (Cell.Link, Run.Link, link state).

Unicode data: the generator reads EastAsianWidth, DerivedGeneralCategory, DerivedCoreProperties (InCB), GraphemeBreakProperty, GraphemeBreakTest, emoji-data and emoji-variation-sequences for 15.1.0 from -ucd (default etc/temp/muxfx-vt/ucd-15.1.0, outside git), downloads a missing file from its unicode.org URL with a timeout and size bound, and refuses a file whose SHA-256 differs from the one recorded in the generator. go generate ./pkg/ajan/muxfx/vt/ reproduces both generated files byte for byte.

Rules: width 2 for EAW W/F or Emoji_Presentation; 0 for Mn/Me/Cf, GCB Extend/ZWJ and Hangul V/T (unless Emoji_Presentation, so skin tone modifiers stay 2); 1 otherwise, ambiguous narrow, U+00AD 1. Clusters follow UAX #29 extended grapheme clusters GB3-GB13 with GB9c (InCB); a cluster is one cell as wide as its widest part; VS16 after an emoji variation base makes it 2, VS15 makes it 1 (the cell narrows and the cursor moves back). A zero-width code point that starts no cluster takes no cell: it goes into the cell before the cursor or is dropped. Clusters continue across writes; control sequences end them as in xterm.js. A cell keeps at most 256 bytes; later code points still join. TestGraphemeBreakConformance passes all 1187 conformance cases; TestClustersTakeOneCellGroup covers ZWJ sequences, flags, tag flags, skin tones, VS15/VS16, keycaps, combining marks, Hangul jamo and Indic conjuncts.

OSC 8: Cell.Link (uint32 id, 0 none), Terminal.Link(id) (Link{ID, URI}), Terminal.CellLink(row, col), Run.Link in screen and history runs, vt.IsSafeLinkURI(uri) (http, https, mailto, file). Same id= parameter plus URI share a link id, as in xterm.js. An empty URI ends the link (also with parameters, where xterm.js ignores the sequence); SGR 0 and DECRC keep it; DECSTR and RIS end it; RIS clears the table and ids keep counting. The table is bounded at 4096 links and 1 MiB (FIFO; a dropped link resolves to none), URIs over 2048 bytes are not stored, ids over 256 bytes are ignored. URIs are stored as sent; the README tells frontends to check the scheme before opening one.

Reference: @xterm/addon-unicode-graphemes 0.4.0 is not in the workspace; a scratch copy was extracted from the npm tarball (SHA-512 matching the registry's integrity) into etc/temp/muxfx-vt/node_modules, and the recorder activates it (15-graphemes) for every case. The recorder also records OSC 8 links per cell (link=<id>;<uri> in the style key) and reads the SGR underline bits for linked cells, since xterm.js reports linked cells as dashed-underlined.

Corpus cases that changed with the move (22, snapshot diffs against the Unicode 6 recording): pty-claude-{100x30,80x24,60x20}, pty-vim-split-{80x24,120x36}, pty-less-long-{80x24,50x15}, pty-shell-color-{80x24,50x16}, pty-shell-scroll-{80x24,120x30}, each with its -scrollback variant. One reason for all: emoji 🙂 🎉 👍 have Emoji_Presentation and take two columns under Unicode 15.1 (one under Unicode 6), and the cursor and wrapping follow. The whole corpus matches xterm.js with the addon. Synthetic cases that changed: utf8-emoji, history-wide-styles-erase, history-combining-widens-at-wrap (emoji and VS16 widths), reflow-moves-combined-chars (input changed to narrow combined characters so it still shows xterm.js's reflow defect), zero-width-in-pending-wrap and rep-after-resize-lone-combining (now addon divergences).

New synthetic cases (vt_snapshots.json 136 cases, vt_corpus.json.gz unchanged in cases, 238 KB): agreeing with the addon: unicode-zwj-sequences, unicode-flags, unicode-skin-tones, unicode-emoji-selector, unicode-combining-marks, unicode-wide-ranges, unicode-cluster-wraps-at-edge, unicode-cluster-rep, unicode-clusters-reflow (with history), unicode-cluster-across-sgr, unicode-cluster-split-across-writes, osc8-links, osc8-id-shared, osc8-wrap-erase-wide, osc8-reset-and-history, osc8-link-wraps-past-its-first-line.

Divergences added, each with a hand-checked screen in TestKnownDivergences. Addon not following Unicode 15.1: zero-width-in-pending-wrap, rep-after-resize-lone-combining, unicode-zero-width-takes-no-cell (the addon gives a lone zero-width character a one-column cell), unicode-text-selector-narrows (addon ignores VS15), unicode-emoji-selector-needs-a-base (addon widens any character before VS16), unicode-zwj-needs-a-pictograph (addon's GB11 joins after any ZWJ), unicode-indic-conjunct (addon lacks GB9c), unicode-lone-regional-indicator (addon makes an unpaired RI one column). xterm.js defects: osc8-survives-cursor-restore (DECRC copies the saved background word, whose extended-attributes bit then drops the open link from later text until certain SGRs), osc8-close-with-params (xterm.js ignores OSC 8 ; params ; ST). vt bound: osc8-uri-too-long. TestKnownDivergences now builds each case at the fixture's scrollback.

Differential runs (scratch, not committed; random streams with clusters, emoji, Hangul, Thai, keycaps and OSC 8, recorded through the recorder's --cases mode): Unicode only, multi-row screens: 14399 streams, 34 differences, all after a resize and all xterm.js's reflow corrupting combined cells (listed class). With OSC 8 and without cursor restores: 14451 streams, 1727 differ only where xterm.js lost a link's data (its OscLinkService drops links tied to lines that left the buffer, while cells still name them), 46 others in the reflow and lost-link classes. Remaining classes in the full runs: one-row autowrap recycling, lone RI widths, DECRC links. One finding was a recorder-tool artifact: xterm.js writeSync per code point does not join clusters, while normal writes do (unicode-cluster-split-across-writes agrees).

Performance (2000 coloured ASCII lines into a 120x40 pane, steady state): the segmenter first cost ASCII throughput (54 to 42 MB/s); an ASCII fast path (ASCII joins only a Prepend) and constant one-byte cell strings (string(rune) allocated per cell) bring it to 123 MB/s at scrollback 0 and 73 MB/s with the default history (44 MB/s before both tasks); CJK/emoji text 50 MB/s before the fast path. History memory re-measured with 44-byte runs (link id): 120 cols 1.6 / 1.4 / 2.9 / 17.5 MB (3061 lines), 240 cols 2.5 / 1.7 / 3.6 / 17.9 MB (1542 lines); README updated.

Fuzz: FuzzTerminalWrite also checks the 256-byte cell bound and link lookups; 10 minute run: 32.6M executions, no finding.

Gates: go test -race -count=1 ./pkg/ajan/muxfx/... ok; golangci-lint run ./pkg/ajan/muxfx/... 0 issues; make ok passed. Privacy grep on vt_corpus.json.gz: 0 matches.
<!-- SECTION:NOTES:END -->
