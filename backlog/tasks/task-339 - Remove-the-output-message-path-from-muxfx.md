---
id: TASK-339
title: Remove the output message path from muxfx
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 13:36'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-336
  - TASK-337
  - TASK-338
priority: medium
ordinal: 342000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When every frontend uses screens (T-T6, T-T7, T-T8), remove the output message, the capability fallback and the code that only fed it; update the muxfx and noskillsserverfx READMEs and the ADR's status line if anything changed on the way.

Plan key: T-T9. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No frontend or test sends or expects output messages; the capability fallback is gone
- [x] #2 The READMEs describe only the screen protocol
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in pkg/ajan/muxfx and pkg/ajan/noskillsserverfx. muxfx: MessageOutput, ServerToFrontend.Data, CapabilityScreen and the output fallback are gone. The server makes the frontend that attaches its screen frontend whatever the attach carries; FrontendToServer.Capabilities stays and is ignored, so a client still sending ["screen"] keeps working (README Screen Messages, protocol.go doc). Pane output before an attach only changes the pane's terminal; the attach brings it in full. The server always answers device queries (DA, CPR) from the pane's terminal: answersReplies, currentSink and the reply forwarding for output frontends are removed. The TUI frontend attaches without capabilities and its ignored MessageOutput case is gone. noskillsserverfx: client.js, mux_render.js (attachFrame is {t, viewport}) and mux_remote.js attach without capabilities; the hub's and /mux comments name scene frames as the only ones that can fill the 1024-frame queue (the mixed screen/output limitation of TASK-338 is gone with output). READMEs (muxfx, noskillsserverfx, cmd/noskills-server) describe only the screen protocol; ADR 0006's status line says it is implemented and names two changes on the way (capabilities accepted and ignored; the 1024-frame drop stays for scene frames).

Tests: no test sends or expects output messages. TestServerSessions/pane_output_reaches_the_frontend_as_its_screen, TestServerFailuresAndExits/a_spawn_failure_is_shown_in_the_pane (read from the screen), TestScreenAttach/an_attach_that_asks_for_screens,_as_frontends_of_the_transition_did,_gets_the_same (nil vs ["screen"] give identical screens), TestScreenAttach/pane_output_brings_a_screen_and_nothing_else, TestScreenDeviceReplies (attached, not yet attached, no frontend: all answered), TestScreenMessageJSON (an attach with capabilities decodes), TestPtyServerLeavesNoGoroutines (waits for READY on the screens), TestMuxSessionRunsWithoutAJavaScriptRuntime and the worker tests (waitForScreen paints screens), dashboard e2e (any frame besides scene, screen, exit fails), TestMuxSessionSendsScreensOverWebTransport (no messages besides scene, screen, exit). TestMuxWorkerCloseReturnsWhileNobodyReads relied on output flooding the 1024 queue; it now checks that a flooding pane leaves the unread client's queue at the screen window (not dropped) and Close still returns. TestRemoteMuxBytesForTheClaudeCodeSession rebuilds the old output bytes from the corpus (scene frames plus one output frame per PTY read, encoded as the legacy line) and pins them at 33793 (remoteOutputBytes); screen 71645 (2.12x), unchanged.

CPU, BenchmarkScreenCatLargeFile (32 MiB coloured log through cat, 118x36 pane, JSON encoding included), Go 1.26.6, Apple M4 Max, -benchtime 3x -count 3: 30.4 to 30.7 ms CPU per MiB, before this task 33 ms (screen frontend); the output-mode case (42 ms) no longer exists. BenchmarkScreenStream (fake host): 32.8 to 33.2 MB/s, before 32 MB/s. README table updated (18 ms raw forwarding before emulation, 31 ms now).
<!-- SECTION:NOTES:END -->
