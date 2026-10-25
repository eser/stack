---
id: TASK-334
title: 'Encode semantic key, paste, mouse and focus input in muxfx by the pane''s modes'
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
ordinal: 337000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Frontends will send what the user did instead of bytes. Add FrontendToServer messages key (key as KeyboardEvent.key, code, modifiers, text), paste (text), mouse (row, col, button, kind press/release/move/wheel, modifiers) and focus (in/out), and an encoder that turns each into bytes for the pane with vt.Modes: application cursor keys (DECCKM), application keypad (DECKPAM), bracketed paste (2004), mouse protocol 9/1000/1002/1003 with encodings default/1006/1016, and focus reports (1004). Function keys, Home/End/PageUp/PageDown, Delete/Insert, modifiers on arrows (CSI 1;m), Alt as ESC prefix, Ctrl letters, Backspace as DEL, Enter as CR. Use xterm.js's encoding (its Keyboard and CoreMouseService code) as the reference and record table tests from it. Strip control characters other than tab and newline from paste text when bracketed paste is on (as xterm.js does for ESC). The existing writeInput stays for the TUI frontend.

Plan key: T-T4. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 key, paste, mouse and focus messages are accepted by muxfx.Server and written to the pane encoded by its current modes
- [x] #2 Table tests cover every listed key and mode and match xterm.js's encoding
- [x] #3 A paste cannot end bracketed paste early (ESC [201~ inside the text is neutralized)
- [x] #4 writeInput still works unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in pkg/ajan/muxfx/semantic_input.go. FrontendToServer gains pane plus key, paste, mouse and focus payloads: {"t":"key","pane":"pane-1","key":{"key":"ArrowUp","code":"ArrowUp","text":"","shift":true}}, {"t":"paste","paste":{"text":"..."}}, {"t":"mouse","mouse":{"kind":"press|release|move|wheel","button":"left|middle|right","wheel":"up|down|left|right","row":0,"col":0,"x":0,"y":0,"alt":true}}, {"t":"focus","focus":{"focused":true}}; pane omitted means the focused pane. Pure encoders EncodeKey, EncodePaste, EncodeMouse, EncodeFocus take vt.Modes. The server asks ServerOptions.PaneModes (a PaneModeSource) for the pane's modes and writes the bytes through a writeToPane action; nil uses the modes of a reset vt.Terminal until TASK-335 keeps a live terminal per pane and supplies its Modes. Keys follow xterm.js evaluateKeyboardEvent with isMac false; two additions are the DECKPAM keypad (SS3 p..y, M, k, m, j, o, n, X, l; xterm.js has none) and Ctrl+Shift+6 as RS. Mouse rows (274) were recorded from @xterm/headless 6.0.0 CoreMouseService with etc/temp/muxfx-vt/record-mouse-reports.mjs. Bracketed paste drops every C0/C1 control but tab and CR (ESC included, so ESC [201~ cannot end the paste). The server drops mouse events outside the pane's content; xterm.js's move debouncing is left to the frontend. SanitizeRemoteMessage now takes a pointer (the struct reached gocritic's 80-byte hugeParam limit) and passes the new messages unchanged; noskillsserverfx deliver functions take pointers too. writeInput is unchanged and covered by a server test.

2026-10-25: rtk make ok and deno task cli ok passed. (Done by a delegated agent.) The make ok failure in its report came from a scratch test in vt/ that TASK-331 has since removed.
<!-- SECTION:NOTES:END -->
