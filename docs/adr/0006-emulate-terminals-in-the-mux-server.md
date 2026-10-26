# Emulate terminals in the mux server and send screens

## Status

Accepted and implemented. The owner chose the direction on 2026-10-25: the mux
server emulates every pane and frontends paint the screens it sends, as Herdr's
daemon does for herdr-gpui. The choices under Decision Outcome were the defaults
the plan started from. TASK-331 to TASK-339 implemented them: every frontend
paints screens, and the `output` message is gone. Three things changed on the
way: an `attach` still accepts `capabilities` and ignores them, so frontends
written during the transition keep working; a socket that falls 1024 frames
behind is still dropped, since scene frames are not held back by the screen
pacing; and runs and rows travel as JSON arrays without their default values
(TASK-357), so a recorded Claude Code session costs 1.07 times the bytes of its
raw output instead of 2.12.

## Context and Problem Statement

A mux pane today runs a program on a pseudo-terminal in `muxfx.Server`. The
server forwards the raw PTY output to every frontend in `output` messages, and
each frontend parses it:

- The Go TUI frontend feeds it to `muxfx/vt`, a headless emulator built to
  match xterm.js.
- The browser dashboard (`noskillsserverfx`) feeds it to xterm.js 5.3.0, loaded
  from jsDelivr with Subresource Integrity digests.

This has costs:

- Two emulators have to agree on every byte. `vt` is held to xterm.js by
  snapshots recorded from `@xterm/headless`, and it inherits xterm.js's limits
  (Unicode 6 widths, no grapheme clusters).
- A frontend that attaches late, or reconnects, sees blank panes: the server
  keeps no screen, so nothing is replayed until the program writes again.
- A slow socket queues raw output; the dashboard drops a socket that falls 1024
  frames behind and the browser starts over.
- The browser runs third-party code from a CDN, an old release on a package
  name the project has since left, which the CSP and the page have to allow.
- Every remote frontend on the daemon's HTTP/3 path gets the full byte stream.

The question is where terminal emulation happens and what the server sends.

## Decision Drivers

- One emulator, so the TUI and the browser show the same screen.
- A frontend that attaches or reconnects sees the current screen at once.
- A slow frontend gets the latest screen, not a backlog.
- No third-party code in the browser, in line with M5 (no JS runtime for the
  daemon and the dashboard).
- Claude Code's TUI renders as well as it does in xterm.js today.
- Text in the browser can be selected, copied, searched and read by a screen
  reader.

## Considered Options

- **Keep xterm.js and upgrade it** to the `@xterm/*` 6 packages with the WebGL
  and Unicode addons. Lowest risk, fixes the old release, keeps two emulators,
  the CDN and the blank reattach.
- **Swap xterm.js for ghostty-web or wterm.** Better Unicode handling from
  Ghostty's parser, but both are early (no stable ghostty-web release), and the
  architecture stays the same.
- **Emulate in the server and send screens.** `muxfx/vt` becomes the only
  emulator; frontends paint cells. This is the model of Herdr, whose daemon
  owns the terminals and sends surface patches to herdr-gpui.

## Decision Outcome

Chosen option: emulate in the server and send screens.

### Emulation

`muxfx.Server` keeps one `vt.Terminal` per pane and writes the PTY output into
it. Frontends never parse VT sequences. Replies the program asks for (cursor
position, device attributes) come from that terminal and go back to the PTY.

### The screen protocol

- A new `screen` message carries one pane's screen: in full on attach, resize
  and reconnect, then as patches that hold only the rows that changed.
- A row is a list of runs: text plus a style id. A per-message style table
  holds the colors and attributes. Wide cells and their spacer cells are kept.
- The message also carries the cursor (position, shape, visibility), the
  title, the mouse reporting the program asked for (so a frontend knows
  whether to send mouse events), and the history lines added since the last
  message.
- The encoding is JSON on the existing transports (in-process, WebSocket,
  WebTransport), like every other mux message.
- Frames are coalesced per pane: at most one every 16 ms, and none while the
  program has synchronized output (DECSET 2026) on, up to a cap after which
  the screen is sent anyway.
- Each frontend has its own set of dirty rows. The server sends when the
  transport can take more, so a slow frontend skips to the latest screen. This
  replaces the 1024-frame drop.

### Scrollback

`vt` gains bounded scrollback: lines that leave the top of the normal screen
become history, stored compactly as runs. The default is 5000 lines per pane,
the browser's setting today, and it is configurable. History lines travel in
`screen` messages; on attach the server sends the most recent ones (1000 by
default). Frontends scroll their own copy. The mouse wheel goes to the program
when it asked for mouse reports or uses the alternate screen, as now, and
scrolls the local history otherwise.

### Input

Frontends send what the user did, not bytes: `key` (the key, its modifiers and
the text it produces), `paste` (text), `mouse` (cell, button, kind,
modifiers) and `focus`. The server encodes each one with the pane's current
modes: cursor and keypad application modes, bracketed paste, the mouse
protocol and encoding (1000, 1002, 1003, 1006, 1016) and focus reports
(1004), with xterm's encoding as the reference. The TUI frontend keeps sending
the bytes its own terminal produced (`writeInput`), as it does now.

### Unicode and links

Because no browser emulator has to agree with `vt` any more, cell widths move
from xterm.js's Unicode 6 tables to the Unicode 15.1 East Asian Width and emoji
presentation data, with grapheme clusters (UAX #29) kept in one cell.
`vt` stores OSC 8 hyperlinks per cell; the browser also links plain URLs it
finds in a row's text.

### The browser renderer

The dashboard paints each pane as DOM rows: one element per row and one span
per style run, colored with CSS. Native selection, copy and find work, and a
screen reader can read the rows. A hidden text area takes keyboard and IME
input and pastes. A canvas renderer is added only if a measurement shows the
DOM is too slow. xterm.js, its CDN links and their CSP entries are removed.

### The TUI frontend

The TUI frontend paints the cells it receives, so attaching a TUI to a remote
server works the same way as the browser.

### Fidelity gate

A corpus of recorded PTY streams (Claude Code, vim, less, top, git's pager,
and the existing streams) is replayed through `vt` and compared with
`@xterm/headless` 6 snapshots, using the recorder in `etc/temp/muxfx-vt/`. The
differences that are meant (the Unicode change, scrollback) are listed in the
test. The Go replay runs in the gate, and the parser is fuzzed.

### Transition

`attach` gains `capabilities`. The server sends `screen` messages to a frontend
that asks for them and `output` messages to the others, until the last frontend
has moved; then `output` goes. The TypeScript mux engine and the TypeScript
dashboard are not ported: TASK-266 deletes them. From the browser renderer task
on, the Go copy of the dashboard's browser files no longer matches the
TypeScript copy byte for byte.

## Consequences

- Good: one emulator; the current screen on every attach; bounded traffic to
  slow and remote frontends; no third-party browser code; selectable,
  searchable, accessible text; Unicode widths that match modern terminals.
- Bad: the server spends CPU and memory on every pane, so the scrollback store
  has to be compact and its memory per pane is measured and bounded.
- Bad: the project owns an emulator's correctness. The fidelity corpus is the
  guard, and a Claude Code rendering bug is now ours to fix.
- Bad: features xterm.js gave for free are rebuilt: selection, copy, links,
  scrollback in the browser, IME input. xterm.js features nobody uses here
  (images, the kitty keyboard protocol, OSC 52 clipboard writes) are not
  supported at first.

## Links

- Herdr and herdr-gpui: https://herdr.dev/, https://github.com/penso/herdr-gpui
- decision-62 in the backlog records this choice; the tasks are TASK-331 to
  TASK-339 in milestone
  "Track T: terminals emulated in the mux server".
- `pkg/ajan/muxfx/README.md` describes `vt` and the current protocol.
