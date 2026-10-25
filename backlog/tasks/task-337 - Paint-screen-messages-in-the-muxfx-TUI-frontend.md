---
id: TASK-337
title: Paint screen messages in the muxfx TUI frontend
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 12:33'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-335
priority: medium
ordinal: 340000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TUI frontend attaches with the screen capability and draws the cells it receives (compositor reads a received screen instead of a local vt.Terminal), so a TUI attached to a remote server shows what the browser shows. Its input stays writeInput. Keep the existing TUI tests green and add one that attaches a second TUI frontend mid-session and checks it shows the current screen.

Plan key: T-T7. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The TUI frontend renders from screen messages and no longer emulates locally
- [x] #2 A TUI frontend that attaches mid-session shows the current screen (test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The TUI frontend attaches with the screen capability and paints a per-pane copy of the received screens (pane_screen.go: rows kept as runs, expanded with vt.RunCells when drawn, plus the cursor). Output messages are ignored, so it no longer emulates locally; since the server now answers device queries for it, programs in the TUI get DA and CPR replies they did not get before. Input stays writeInput. A screen message is treated as untrusted: sizes clamped to MaxRemoteViewportCols by MaxRemoteViewportRows, rows and styles out of range ignored, run lengths clamped, control characters in run text replaced with spaces. Screens of hidden panes (other tabs, behind a fullscreen pane) are kept across scene changes, up to 32 besides the ones on show, the stalest dropped first. The cursor honours DECTCEM now (the old local renderer always drew it). History is not kept: the TUI has no scrollback of its own (scroll mode writes scroll sequences to the program), and the box label stays the scene's title. vt.RenderScreen, RenderOptions, RenderState and the dirty-row tracking (DirtyLines, ClearDirty, MarkAllDirty, MarkLineDirty) had no other user and are removed. Tests: TestTuiFrontendShowsCurrentScreenOnAttach (a second frontend takes over mid-session and paints the current screen, then patches), TestTuiFrontendKeepsTheScreensOfHiddenPanes, TestTuiFrontendBoundsHiddenScreens, TestPaneScreenRender, TestPaneScreenRedrawsChangedRows, TestPaneScreenBoundsRemoteInput; TestComposite and TestTuiFrontendEndToEnd still pass.
<!-- SECTION:NOTES:END -->
