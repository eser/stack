---
id: TASK-263
title: Build muxfx in Go on shellfx/pty
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 23:22'
labels:
  - go
  - mux
milestone: m-5
dependencies:
  - TASK-174
priority: medium
ordinal: 263000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision vt-emulator, add a Go mux engine with sessions, panes, a VT screen model and frontends. It replaces the TS mux engine (1,253 lines) and shell/vterm (@xterm/headless). Go-only work that can start any time after M0.

Decisions this task waits on: decision-27 (VT screen model for the Go mux).

Plan key: M5-T1. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Screen-model tests replay recorded PTY output and match the TS snapshots
- [x] #2 golangci-lint passes, and the tests show no goroutine leaks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent, checked here).
Vetting (decision-27), each candidate replayed against the xterm snapshots in a scratch module:
- charmbracelet/x/vt v0.1.0: 55/75. No reflow, wrong wide-char cursor, CSI s/u, insert and origin modes, DECALN, alt screen 47; its reply pipe blocks Write. First tag 13 days old, depends on untagged ultraviolet.
- danielgatis/go-headless-term v1.0.9: 59/75. Scroll regions broken, which fails the vim replay; no reflow or combining characters.
- hinshun/vt10x, ActiveState/vt10x, liamg/darktile: unmaintained.
So the VT model is in-house, following xterm.js (VT500 table, Unicode 6 widths, reflow; MIT credited in vt/reflow.go). No dependency added.
Added pkg/ajan/muxfx (split tree, geometry, reducer, sanitize, scene, protocol, keybindings, input, scheduler, pty_host on shellfx/pty, server, ansi, compositor, tui_frontend on shellfx/tui, runner, README) and pkg/ajan/muxfx/vt.
AC #1: testdata/vt_snapshots.json holds 81 cases recorded with @xterm/headless 6.0.0 (the shell/vterm settings, scrollback 0).
- Sources: real PTY captures (sh with tput, a vim session, less) and synthetic streams for everything in the brief and more.
- Each case is replayed whole and one byte per write.
- One case is skipped with its reason: on a narrowing reflow at scrollback 0, xterm.js shows a row twice; Go drops the top row (vt/buffer.go:263, TestNarrowingReflowDropsTheTopRow).
AC #2: golangci-lint 0 issues. go test -race passes (-count=3 too); muxfx 80.4% and vt 85.6% coverage. leak_test.go compares goroutine stacks around real PTYs (SIGTERM-ignoring pane, escalation to SIGKILL) and an end-to-end TUI run; goleak is not in go.mod.
Deliberate differences from TS:
- A wide character is drawn once, and the previous cursor row is redrawn. TS shifted wide characters and left a cursor trail.
- Enter decodes as 'enter'. TS decoded 'return', so enter bindings never matched.
- Inputs go through one ordered queue, and spawn is synchronous.
- Output is held back to whole UTF-8 characters.
- OSC payloads over 4096 runes are dropped.
Not here: the WebSocket transport (TASK-264/265) and deleting the TS twins. The recorder scripts are in gitignored etc/temp/muxfx-vt/; the README documents the method. Moving them to a tracked path would make the fixtures re-recordable from the repo (owner's choice).
Closing waits on a clean deno task cli ok (concurrent aifx and noskills work in progress).

2026-10-25: deno task cli ok and make ok passed with all concurrent work in place.
<!-- SECTION:NOTES:END -->
