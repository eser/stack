---
id: TASK-335
title: Emulate panes in muxfx.Server and send screen messages
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 12:04'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-332
  - TASK-333
priority: medium
ordinal: 338000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
muxfx.Server keeps a vt.Terminal per pane (reply writer wired to the PTY) and sends ServerToFrontend screen messages instead of output to frontends that attach with capabilities ["screen"]: full on attach, resize and reconnect (with the last 1000 history lines, configurable), then patches of changed rows. A row is runs of text plus style ids, with a style table per message; wide-cell spacers kept; cursor position, shape and visibility; title; the pane's mouse protocol; links (T3); history lines added (T2). Track dirty rows per frontend and send when that frontend's transport can take more, at most one frame per pane every 16 ms, holding frames while synchronized output (DECSET 2026) is on, up to 200 ms. A slow frontend receives the latest screen. Frontends without the capability keep getting output messages unchanged. Document the message in the muxfx README with an example, and add a benchmark: a pane streaming a large file through cat must not cost more CPU than a budget recorded in the task notes.

Plan key: T-T5. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A frontend with the screen capability gets a full screen on attach with history, then row patches; without it, output as today
- [x] #2 A frontend that attaches while a program runs sees the current screen at once (test)
- [x] #3 A slow frontend receives the latest screen and the server's memory per frontend stays bounded (test with a blocked transport)
- [x] #4 Synchronized output holds frames up to the cap (test)
- [x] #5 The README documents the screen message, and a benchmark records the CPU cost of a streaming pane
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (muxfx and vt):
- muxfx.Server keeps a vt.Terminal per pane (server_screen.go), created at spawn, resized with the PTY, dropped with the pane. A frontend that attaches with capabilities ["screen"] (CapabilityScreen) gets MessageScreen messages ({"t":"screen","pane","screen":ScreenUpdate}) after the scene; others get output messages unchanged. ScreenUpdate (screen.go): full, cols, rows, cursor (x clamped to cols-1, y, visible, DECSCUSR shape and blink), title, mouse, altScreen, a per-message style table (entry 0 is the default), links, changed rows as runs (wide cells and spacers kept), history (reset or appended lines).
- Full on attach, reconnect and pane resize, with the last ScreenHistory lines (DefaultScreenHistory 1000; ServerOptions.ScreenHistory, Scrollback configure it). Patches hold rows that differ from what the frontend was last sent (paneView): per-frontend dirty-row state bounded by pane size, no frame queue.
- Pacing: at most one frame per pane per ScreenFrameInterval (16 ms), held while DECSET 2026 is on up to SynchronizedOutputHold (200 ms). Injectable ServerOptions.Clock; tests use a fake clock.
- Flow control: optional FlowControl interface (Writable, OnWritable) on the server-side transport; screens go only while writable, the latest screen is sent on the callback. SanitizeRemoteTransport forwards it.
- Deferred items: (1) PaneModes defaults to each pane's live vt modes. (2) SanitizeRemoteMessage/Action clamp attach, resize and resizeViewport to MaxRemoteViewportCols x MaxRemoteViewportRows (512 x 256), ClampRemoteViewport exported. (3) vt models DECSCUSR (Terminal.CursorStyle, CursorShape, CursorBlink), recorded against @xterm/headless 6.0.0 in three new synthetic fixture cases (cursor-style-*); corpus unchanged. vt also gained Terminal.HistoryStamp for non-draining history consumers. (4) Device replies come from the pane terminal and go to the PTY while the frontend has the screen capability or no frontend is connected; output frontends answer as before. (5)(6) see above. (7) README Screen Messages section with a real message example.
- API note: ServerToFrontend.Code is now int32 and the struct fields were reordered, keeping the message under gocritic's 80-byte hugeParam limit after adding Screen.
- Benchmark budget: BenchmarkScreenCatLargeFile (real PTY, cat of a 32 MiB coloured log, 118x36 pane, JSON encoding included), Go 1.26.6 on Apple M4 Max: screen frontend 33 ms CPU per MiB, output frontend 42 ms, output before this task 18 ms. Budget: 80 ms CPU per MiB for the screen case; the benchmark fails above it. BenchmarkScreenStream (fake host): output 52 MB/s, screen 32 MB/s.
- Follow-ups: the vt emulation costs about 24 ms per MiB also in output mode; in the fake-host profile about 29 percent of screen-mode CPU is encoding/json compacting the output of ServerToFrontend.MarshalJSON, which a transport could avoid by encoding ScreenUpdate directly (TASK-338).
<!-- SECTION:NOTES:END -->
