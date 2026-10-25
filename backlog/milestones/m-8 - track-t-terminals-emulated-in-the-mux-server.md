---
id: m-8
title: "Track T: terminals emulated in the mux server"
---

## Description

ADR 0006 and decision-62: muxfx.Server emulates every pane with muxfx/vt and sends screens (full on attach, row patches after); frontends paint cells and send semantic input; the browser drops xterm.js for a DOM renderer.
