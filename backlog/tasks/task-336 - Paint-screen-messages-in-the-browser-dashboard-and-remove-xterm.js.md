---
id: TASK-336
title: Paint screen messages in the browser dashboard and remove xterm.js
status: Done
assignee: []
created_date: '2026-10-25 08:50'
updated_date: '2026-10-25 12:33'
labels:
  - mux
  - terminal
milestone: m-8
dependencies:
  - TASK-334
  - TASK-335
priority: medium
ordinal: 339000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace xterm.js in pkg/ajan/noskillsserverfx/web/static/mux_render.js with a DOM renderer of screen messages: one element per row, one span per style run, CSS for colors (256 and truecolor), bold, italic, underline styles, inverse, dim, strikethrough; the cursor; wide cells. Input through a hidden textarea: keydown to key messages, composition (IME) and paste to paste messages, mouse to mouse messages when the pane's mouse protocol asks for them, focus. Local scrollback from history lines with the wheel when the program does not take mouse reports. Native selection and copy over rows; links from OSC 8 and plain URLs in row text, opened with rel=noopener. Remove the xterm.js script and stylesheet, their SRI digests and the jsDelivr CSP entries. The Go copy of the browser files stops being byte-identical to the TypeScript copy: drop that check from TestStaticFiles and the note in docs/agents/languages-and-security.md. Update the e2e test to drive the new input messages and read the painted rows. Check the page with the frontend-practices a11y rules (rows readable by a screen reader, focus visible, keyboard only).

Plan key: T-T6. ADR 0006, decision-62.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The dashboard renders panes from screen messages with no xterm.js and no third-party script or stylesheet
- [x] #2 Keys, IME input, paste, mouse and focus reach the pane through the semantic messages
- [x] #3 Selection, copy, links and local scrollback work, with tests in the browser-script harness
- [x] #4 The e2e test passes with the new renderer, and the CSP no longer allows jsDelivr
- [x] #5 Claude Code's start screen and /help render the same as the corpus snapshot (a test paints the recorded stream)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in pkg/ajan/noskillsserverfx: mux_render.js paints screen messages as DOM rows (one span per run, fixed cell widths, styles from the message table, cursor shape and blink, OSC 8 and plain-URL links checked like vt.IsSafeLinkURI without file:), with a hidden textarea per pane sending key, paste (also IME), mouse (only with a mouse mode) and focus messages, and local history scrolling (wheel, Shift+Page Up/Down). client.js and mux_remote.js attach with the screen capability. xterm.js, its SRI tags and the jsDelivr CSP entries are gone; the CSP is now script-src 'self', style-src 'self' (phase badges colored by class), img-src 'self', connect-src 'self' plus the dashboard's own ws:// origins. The /mux hub implements muxfx.FlowControl (window of 4 queued frames) and holds back screen patches until a new socket's full scene. Tests: web/browser_scripts.test.ts (Deno, fake DOM) paints testdata/claude_code_screens.json.gz, made by TestDashboardPaintsTheClaudeCodeCorpus from the pty-claude-100x30 corpus case (steps 0-8: trust prompt, start screen, /help), and compares text, wide cells, styles and cursor; the e2e test drives key, paste, focus and mouse messages and reads painted rows. TestStaticFiles no longer compares with the TypeScript copy. Open: cmd/noskills-server/README.md still says the tabs run in xterm.js (outside this task's scope); mux_remote.js depends on TASK-338 for the daemon side.
<!-- SECTION:NOTES:END -->
