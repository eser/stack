---
id: TASK-338
title: Move the daemon's remote mux path to screen messages
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 13:00'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-336
priority: medium
ordinal: 341000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The HTTP/3 daemon path (noskillsserverfx worker_mux, WebTransport) and mux_remote.js use the screen capability and the semantic input messages, with the renderer from T-T6. Measure the bytes sent for a recorded Claude Code session over the remote path before and after and record them in the task notes.

Plan key: T-T8. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The remote mux path sends screen messages and accepts semantic input
- [x] #2 The bytes sent for a recorded Claude Code session are measured before and after and recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in pkg/ajan/noskillsserverfx. The mux worker's server is now connected to a muxHub (mux_hub.go, shared with the dashboard's /mux route and generalized to several sockets) instead of pushing every frame through the session pump and the broadcaster. Each WebTransport attach of a mux session joins the hub with a queuedSocket of its own (remoteMuxWorker in wt_attach.go); forwardEvents writes the socket's frames and the session events on the one stream. Wire shape unchanged for clients: {"type":"mux","v":1,"seq":N,"frame":FRAME} per line, FRAME encoded once and not parsed again (the key order changed: before, the daemon decoded the frame into a map and re-encoded it with sorted keys). Inbound frames still pass muxfx.SanitizeRemoteTransport (the hub's transport), so newTab/newPane spawn fields are stripped and attach/resize/resizeViewport are clamped to 512x256; the auth and origin checks of /attach are untouched. Flow control: the hub implements muxfx.FlowControl; it is full while any socket has muxScreenWindow (4) frames waiting and calls the server back when all have room, or when a full socket leaves. A socket whose queue reaches 1024 frames is dropped and its attach ends (errMuxClientBehind); the client reattaches and gets a full scene. A newly joined socket gets scene deltas and screens only after the full scene its own attach brings. Several clients share the server's one frontend: the last attach sets viewport and capabilities, screens go at the pace of the slowest client. Also fixed: the attach read client lines with bufio.Scanner's 64 KiB default, so a larger paste ended the attach; the limit is now 1 MiB like /mux (TestAttachTakesALargePaste, failing first).

AC #2, bytes (TestRemoteMuxBytesForTheClaudeCodeSession, BenchmarkRemoteMuxClaudeCodeSession wire-B/op). Method: the pty-claude-100x30 corpus case (23193 bytes of PTY output, 23 writes and 3 resizes in 26 steps) played through the mux worker's real muxfx.Server on a fake pane host, one PTY read per step, a stepped clock moved past the synchronized-output hold after each step; the mux lines a client gets are counted with the attach's line framing; replay lines and QUIC framing excluded. Output messages as the daemon sent them before this task: 33793 bytes in 28 lines (the new path sends the same 33793 for output). Screen messages: 71645 bytes in 32 lines (27 screens, 4 of them full: attach and the three resizes). Ratio screen/output: 2.12. The screens paint every corpus expectation before the first resize. Where the bytes go: about 48 percent of the screen bytes are the run objects' keys ("width":1 alone is 11 KB, 16 percent), text 18 KB, style tables 3.7 KB. The corpus steps are whole redraws, so coalescing saves nothing here; screens win on bursts faster than 16 ms and on slow clients. The test fails above 2.5 times. Follow-up candidate: a more compact run encoding (width absent when 1, or runs as arrays) would bring screens near the output's size; it changes the screen protocol, mux_render.js, the TUI and the fixtures, so it was left out.

Item 3, encoder: the hub calls ServerToFrontend.MarshalJSON directly (encodeMuxFrame) instead of json.Marshal, which compacted MarshalJSON's result again. BenchmarkRemoteMuxEncoding over the session's 27 screen messages (69 KB), Go 1.26.6, Apple M4 Max: before this task (pump wrapper, decode into a map, re-encode) 2.05 ms, json.Marshal 383 us, MarshalJSON direct 143 us (482 MB/s, 54 allocs). The dashboard's /mux route uses the same encoder. Whole session (BenchmarkRemoteMuxClaudeCodeSession): output 0.47 ms, screen 1.12 ms per session including the vt emulation.

Tests: TestMuxSessionSendsScreensOverWebTransport (real PTY over WebTransport: full scene, full screen, then patches only, no output messages; paste and key input reach the stand-in claude), TestRemoteMuxSemanticInputReachesThePane (key, paste, mouse, focus bytes by mode), TestARemoteClientThatStopsReadingGetsTheLatestScreen (blocked net.Pipe writer: backlog stays within the window, not dropped, latest screen after it reads, fewer screens than lines), TestRemoteMuxClampsAnOversizeViewport (attach, resize, resizeViewport), TestMuxHubJoinedSocketsShareTheFrames, TestMuxHubWaitsForTheSlowestSocketAndNotForOneThatLeft, TestForwardEventsEndsWhenTheMuxSocketFellBehind, TestAttachTakesALargePaste. The output path stays (TASK-339). No CHANGELOG entry: muxfx and the in-process mux worker are new in this cycle, and the wire stays compatible for released clients (same envelope fields, screen capability opt-in).
<!-- SECTION:NOTES:END -->
