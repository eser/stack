---
id: decision-62
title: Emulate terminals in the mux server and send screens
date: '2026-10-25 08:47'
status: accepted
---

## Context

muxfx.Server forwards raw PTY output, and every frontend emulates it: the Go TUI with muxfx/vt, the browser dashboard with xterm.js 5.3.0 from jsDelivr. Two emulators must agree, a reattaching frontend sees blank panes until the program writes again, a slow socket queues raw bytes (the dashboard drops it at 1024 frames behind), and the browser runs third-party code. Herdr solves the same problem by emulating in its daemon and sending surface patches to herdr-gpui, which only paints cells.

## Options

- Keep xterm.js and upgrade it to the @xterm/* 6 packages
- Swap it for ghostty-web or wterm
- Emulate in the mux server with muxfx/vt and send screens; frontends paint cells

## Decision

Emulate in the mux server and send screens (docs/adr/0006-emulate-terminals-in-the-mux-server.md). The defaults the plan starts from, each revisable before its task starts:

- one vt.Terminal per pane in muxfx.Server;
- a `screen` message (full on attach, row patches after, runs plus a style table, cursor, title, mouse mode, history lines), coalesced at 16 ms, held during synchronized output, with latest-state backpressure per frontend;
- bounded scrollback in vt (5000 lines, 1000 sent on attach);
- semantic input (`key`, `paste`, `mouse`, `focus`) encoded by the server with the pane's modes;
- Unicode 15.1 widths with grapheme clusters, and OSC 8 links;
- a DOM row renderer in the browser instead of xterm.js;
- the TUI frontend paints received screens;
- a fidelity corpus replayed against @xterm/headless 6 snapshots as the gate;
- capability negotiation on attach until every frontend has moved; then `output` goes.

## Decided by

The owner chose the direction on 2026-10-25, after comparing xterm.js, ghostty-web, wterm and Herdr's model. The listed defaults are the agent's proposals, accepted with the direction.

## Blocks

The tasks of milestone m-8 (Track T).

Plan key: `track-t-server-emulation`
