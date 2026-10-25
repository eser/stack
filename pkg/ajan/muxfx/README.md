# 🪟 [ajan/muxfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/muxfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`muxfx` is the core of a terminal multiplexer: tabs, split panes, keybinding
modes and the processes running in them. A pure engine (split tree, geometry,
`Reduce`) holds the state, a `Server` owns the pseudo-terminals through
`shellfx/pty` and turns reducer effects into I/O, and frontends draw what the
server sends. The `vt` subpackage is the screen model: the server keeps one per
pane and sends its screen to frontends that ask for it, and the terminal
frontend paints the screens it receives. It is the Go replacement for the
TypeScript `@eserstack/mux` engine and the `@eserstack/shell/vterm` wrapper
around `@xterm/headless`, and its messages have the same JSON shape as theirs.

## Quick Start

Run the server and the terminal frontend in one process, with your shell in the
first pane:

```go
package main

import (
	"context"
	"log"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

func main() {
	if err := muxfx.RunInProcess(context.Background(), &muxfx.RunInProcessOptions{}); err != nil {
		log.Fatal(err)
	}
}
```

Run it in a real terminal. Press `ctrl+p` then `v` or `s` to split, `h`, `j`,
`k`, `l` to move focus and `x` to close a pane; `ctrl+t` then `n` for a new tab
and `h` or `l` to switch tabs; `ctrl+q` to quit. `RunInProcessOptions` takes
`Shell`, `ShellArgs` and `Cwd` for terminal panes, or a `ResolveSpawn` function
that decides what every pane runs.

## Composing the Pieces

`RunInProcess` wires the parts below together. Wire them yourself to change the
keymap, the chrome or the transport:

```go
server := muxfx.NewServer(&muxfx.ServerOptions{
	InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 120, Rows: 40}),
	ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec {
		return muxfx.SpawnSpec{Command: "/bin/sh"}
	},
})

serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
server.Connect(serverSide)

keymap := muxfx.MergeOverrides(muxfx.DefaultKeymap(), muxfx.KeymapTable{
	muxfx.ModeNormal: {"ctrl+b": {{Type: muxfx.ActionSwitchMode, Mode: muxfx.ModePane}}},
})

frontend := muxfx.NewTuiFrontend(&muxfx.TuiFrontendOptions{Transport: frontendSide, Keymap: keymap})
server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

err := frontend.Run(ctx)
frontend.Stop()
_ = server.Dispose(ctx)
```

| Part               | Role                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `NewServer`        | Owns engine state and the pane processes, sends scene and screens   |
| `NewTuiFrontend`   | Draws the scene in the terminal and turns keys into actions         |
| `NewInProcessPair` | Two connected transports for a server and a frontend in one process |
| `NewPtyHost`       | The default pseudo-terminal backend the server uses                 |
| `NewScheduler`     | Coalesces render requests into frames                               |

`ServerOptions` also takes `Chrome` (rows and columns reserved for the tab bar,
the status bar and sidebars), `KeepEmptySession` (keep serving after the last
tab closes, for a long-lived host), `OnPaneExit`, `OnError`, `PaneModes` (see
Semantic Input), `Scrollback` and `ScreenHistory` (see Screen Messages), `Clock`
to step time in tests, and `NewHost` to replace the pseudo-terminal backend in
tests. `Server.Dispatch` drives the session from code, for example from an
agent.

The server applies its inputs one at a time and in arrival order. A frontend may
answer a message by sending an action from inside its handler; the server
applies it after the current one instead of deadlocking.

## Remote Frontends

An action from a remote client can name a command, arguments and a working
directory for a new tab or pane. Wrap every transport that crosses a network in
`SanitizeRemoteTransport`, which strips those fields so the server's
`ResolveSpawn` alone decides what runs. Sanitizing is a second line of defence,
not authentication: anyone who can open the connection can type into your
shells. The server serves one frontend at a time; connecting a new transport
closes the previous one, and the panes keep running across reconnects.

The sanitizer also bounds the size a remote client reports. The server keeps a
screen model of every pane, sized by the viewport, so `attach` and `resize`
messages and `resizeViewport` actions are clamped to `MaxRemoteViewportCols` by
`MaxRemoteViewportRows` (512 by 256, more than a 4K screen shows at a readable
font size; a pane that large holds 8.4 MB of cells, twice that once its program
used the alternate screen). `ClampRemoteViewport` applies the same bound.

The `key`, `paste`, `mouse` and `focus` messages below pass the sanitizer
unchanged: they write to a pane as a `writeToPane` action does and cannot start
a process.

## Semantic Input

Frontends paint screens and parse no pane output, so a browser sends what the
user did instead of bytes. The server encodes each message with the pane's
current terminal modes and writes the result to the pane. Each message carries
its payload in the field named like its type, and `pane` picks the pane; without
it the message goes to the focused pane of the active tab:

```json
{"t":"key","pane":"pane-1","key":{"key":"ArrowLeft","code":"ArrowLeft","shift":true,"ctrl":true}}
{"t":"key","key":{"key":"a","code":"KeyA","text":"a"}}
{"t":"paste","paste":{"text":"ls -l\n"}}
{"t":"mouse","pane":"pane-2","mouse":{"kind":"press","button":"left","row":3,"col":10,"alt":true}}
{"t":"mouse","mouse":{"kind":"wheel","wheel":"down","row":0,"col":0,"x":5,"y":7}}
{"t":"focus","focus":{"focused":false}}
```

| Message | Payload                                                                                                                  | Modes that change the bytes                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `key`   | `key` and `code` as a browser `KeyboardEvent` has them, the `text` the key types, `shift`, `alt`, `ctrl`, `meta`         | Application cursor keys (DECCKM), keypad (DECKPAM)    |
| `paste` | `text`                                                                                                                   | Bracketed paste (2004)                                |
| `mouse` | `kind` (`press`, `release`, `move`, `wheel`), `button` (`left`, `middle`, `right`), `wheel`, the 0-based `row` and `col` | Protocol (9, 1000, 1002, 1003), encoding (1006, 1016) |
| `focus` | `focused`                                                                                                                | Focus reports (1004)                                  |

The encoding follows xterm.js 6. Alt with a key sends ESC and the key, so a
frontend that lets AltGr or the macOS Option key compose characters sends the
composed `text` with `alt` and `ctrl` off. A bracketed paste drops every control
character but tab and newline, so an `ESC [201~` inside the text cannot end the
paste early. A mouse event outside the pane, or one the program's protocol does
not report, is dropped; `x` and `y` are the pixel offset inside the pane, which
only the 1016 encoding reports. The TUI frontend keeps sending the bytes its
terminal produced in `writeInput` actions.

The modes are the live ones of the `vt.Terminal` the server keeps for the pane,
so a key sent after vim switched to application cursor keys arrives as vim
expects. `ServerOptions.PaneModes` replaces that source with a `PaneModeSource`
of your own, which tests use to pick modes without running a program. The
encoders are exported for a frontend or a test that needs the bytes:

```go
modes := vt.Modes{ApplicationCursorKeys: true, BracketedPaste: true}

up := muxfx.EncodeKey(&muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}, modes)
paste := muxfx.EncodePaste("echo hi\n", modes)

fmt.Printf("%q %q\n", up, paste) // "\x1bOA" "\x1b[200~echo hi\r\x1b[201~"
```

## Screen Messages

The server writes every pane's output into a `vt.Terminal` of its own (ADR 0006)
and sends every frontend what those terminals show, so no frontend parses VT
sequences. A frontend attaches with its viewport:

```json
{ "t": "attach", "viewport": { "cols": 120, "rows": 40 } }
```

An attach may also carry `capabilities`, which the server ignores, so a frontend
that still sends `["screen"]` keeps working. The TUI frontend paints the cells
it receives too, so a TUI attached to a remote server draws the same screens a
browser gets. After the scene, the frontend gets a `screen` message per pane: in
full on attach, on reconnect and when the pane's size changes, then patches with
the rows that changed. Pane output before the attach only changes the pane's
terminal; the attach brings it in full. Below, the full screen of a 30 by 3 pane
after a command is followed by the patch that `ls` and Enter bring: the three
rows that moved and the line that scrolled into the history.

```json
{"t":"screen","pane":"pane-1","screen":{
  "full":true,"cols":30,"rows":3,
  "cursor":{"x":2,"y":2,"visible":true,"shape":"bar","blink":false},
  "title":"make","mouse":"none","altScreen":false,
  "styles":[{},{"fg":{"mode":1,"value":2},"flags":1}],
  "links":[{"link":1,"uri":"https://example.com"}],
  "lines":[
    [0,[["$ make"]]],
    [1,[["ok",1],1,["漢字",0,4,2],[" "],["docs",0,4,1,0,1]]],
    [2,[["$ "]]]],
  "history":{"reset":true,"lines":[]}}}
{"t":"screen","pane":"pane-1","screen":{
  "full":false,"cols":30,"rows":3,
  "cursor":{"x":0,"y":2,"visible":true,"shape":"bar","blink":false},
  "title":"make","mouse":"none","altScreen":false,
  "styles":[{},{"fg":{"mode":1,"value":2},"flags":1}],
  "links":[{"link":1,"uri":"https://example.com"}],
  "lines":[
    [0,[["ok",1],1,["漢字",0,4,2],[" "],["docs",0,4,1,0,1]]],
    [1,[["$ ls"]]],
    [2,[]]],
  "history":{"lines":[[[["$ make"]]]]}}}
```

| Field          | Meaning                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`         | The message replaces the frontend's copy of the pane: `lines` holds every row and `history` is a reset                                                                                                                  |
| `cols`, `rows` | The pane's size in cells                                                                                                                                                                                                |
| `cursor`       | 0-based `x` (at most `cols` - 1, also while a character in the last column waits to wrap) and `y`, `visible`, and the DECSCUSR `shape` (`block`, `underline`, `bar`) and `blink`, each absent when left to the frontend |
| `title`        | The title the program set with OSC 0 or 2                                                                                                                                                                               |
| `mouse`        | The mouse reporting the program asked for: `none`, `x10`, `vt200`, `drag` or `any`; send `mouse` messages only when it is not `none`                                                                                    |
| `altScreen`    | Whether the alternate screen is active; with it, or with mouse reporting, the wheel goes to the program, otherwise it scrolls the frontend's history                                                                    |
| `styles`       | The message's style table, which runs index; entry 0 is always the default style                                                                                                                                        |
| `links`        | The OSC 8 hyperlinks the runs name: `link` is the id runs carry, stable while the pane lives, `id` the program's `id=` parameter. Check the URI's scheme with `vt.IsSafeLinkURI` before opening it                      |
| `lines`        | Changed rows, each `[row, runs]`, with a third element `1` when the row continues the one above because the text wrapped. The runs start at column 0, and the columns after them are blank in the default style         |
| `history`      | Lines that scrolled into the history, oldest first, each `[runs]` or `[runs, 1]` when wrapped: appended to the frontend's copy, or replacing it with `reset`. Apply it before `lines`                                   |

A style is `vt.Attrs` with its defaults left out: `fg`, `bg` and
`underlineColor` (`mode` and `value` as in `vt.Color`), `flags` (the `vt.Flags`
bits: 1 bold, 2 dim, 4 italic, 8 underline, 16 blink, 32 inverse, 64 invisible,
128 strikethrough, 256 overline) and `underline` (a `vt.UnderlineStyle`).

A run is `vt.Run` on the wire, as an array, since runs are most of a message:
`[text, style, cells, width, cluster, link]`. `text` is `""` for blank cells,
`style` an index into `styles`, `cells` the columns the run covers, `width` that
of each cell, `cluster` 1 when `text` is one cell's grapheme cluster, and `link`
an entry of `links`. The trailing elements that hold their defaults are left
out: style 0, cells the text's code points times the width (the width for a
cluster; a blank run's text counts none, so it always carries its cells), width
1, cluster 0 and link 0. A run of blank cells in the default style, of width 1
and without a link, is just the number of its cells, as the `1` between `ok` and
`漢字` above. A wide character has `width` 2 and covers its spacer column, which
`cells` counts; a blank run of `width` 0 is the leftover of a wide character
that lost its left half, where a frontend draws nothing. Read the arrays as
untrusted input: bound `cells` by the pane, take a `width` other than 0 or 2 as
1, and skip a run or a row of another shape. `ScreenRun.UnmarshalJSON` rejects
runs of the wrong shape, and `ScreenUpdate.MarshalJSON` writes the wire form
without `encoding/json`'s reflection.

A full message carries the last 1000 history lines (`DefaultScreenHistory`;
`ServerOptions.ScreenHistory` changes it, a negative value sends none). Each
pane's terminal keeps `vt.DefaultScrollback` (5000) lines unless
`ServerOptions.Scrollback` says otherwise. A patch carries every line added
since the previous message; when more were added than the pane still holds, it
is a reset with the last lines instead.

The server paces the messages per pane: at most one every `ScreenFrameInterval`
(16 ms), with the changes in between sent together, and none while the program
has synchronized output (DECSET 2026) on, for up to `SynchronizedOutputHold`
(200 ms), after which the screen is sent anyway. It keeps no queue of frames:
for each pane it remembers what the frontend was last sent and sends the rows
that differ from it, so a slow frontend skips to the latest screen and the
memory per frontend is bounded by the panes' size. A transport that can say when
it is full implements `FlowControl` (`Writable` and `OnWritable`); the server
then sends screens only while it is writable and tries again when it calls back.
`SanitizeRemoteTransport` keeps the flow control of the transport it wraps.
Scene and exit messages are sent regardless. The hub in `noskillsserverfx` that
the dashboard's `/mux` WebSocket and the daemon's WebTransport attaches send
through is such a transport: it reports itself full while one of its clients has
4 frames waiting.

Programs that query the terminal (device attributes, cursor position) get the
answer from the pane's terminal, written back to the pane, whether a frontend is
attached or not; frontends never see the queries.

`BenchmarkScreenCatLargeFile` runs `cat` on a 32 MiB coloured log in a real pane
of 118 by 36 cells and measures the CPU time the server process spends per MiB,
the JSON encoding of every message included. Measured with Go 1.26 on an Apple
M4 Max:

| Server                                          | CPU per MiB |
| ----------------------------------------------- | ----------- |
| Forwarding raw output, before it emulated panes | 18 ms       |
| Emulating the pane and sending screens          | 31 ms       |

Emulating the pane costs about 24 ms per MiB, whether a frontend is attached or
not. A frontend gets at most 60 screen messages a second per pane instead of one
message per PTY read. The benchmark fails above 80 ms per MiB.
`BenchmarkScreenStream` measures the same on a fake host, without the PTY:

```sh
go test -run '^$' -bench 'BenchmarkScreen' -benchtime 3x ./pkg/ajan/muxfx/
```

A transport that encodes the messages itself should call
`ServerToFrontend.MarshalJSON` directly. `json.Marshal` calls it too and then
compacts the bytes it returns, which for a screen message takes longer than
encoding it. On the screen messages of the recorded Claude Code session
(`pty-claude-100x30`), 27 messages of 34 KB, `BenchmarkRemoteMuxEncoding`
measures 52 µs with `MarshalJSON` against 176 µs with `json.Marshal`, with Go
1.26 on an Apple M4 Max. Those messages take 1.07 times the bytes of the raw
output the daemon sent for the session before it emulated panes
(`TestRemoteMuxBytesForTheClaudeCodeSession`):

```sh
go test -run '^$' -bench 'BenchmarkRemoteMuxEncoding' ./pkg/ajan/noskillsserverfx/
```

## Keybindings

Keys are read per mode: `normal`, `pane`, `tab`, `resize`, `scroll` and
`locked`. In `normal` mode the reserved chords switch modes (`ctrl+p` pane,
`ctrl+t` tab, `ctrl+n` resize, `ctrl+s` scroll, `ctrl+g` locked) and every other
key goes to the focused pane. In `locked` mode only `ctrl+g` is read, so
full-screen programs get every key. `BuildKeymap` compiles a table of chords to
actions, `MergeOverrides` lays your chords over a keymap, and `Lookup` returns
the actions bound to a chord.

## Engine

The engine does no I/O. `Reduce` returns the next state and the effects
(`spawnPty`, `writePty`, `killPty`, `scrollPane`, `render`, `detach`, `exit`)
for the server to run, and never changes the state it is given:

```go
state := muxfx.NewInitialState(muxfx.Viewport{Cols: 80, Rows: 24})
result := muxfx.Reduce(&state, &muxfx.Action{Type: muxfx.ActionNewTab})

fmt.Println(len(result.State.Tabs))   // 1
fmt.Println(result.Effects[0].Type)  // spawnPty
```

`SplitLeaf`, `RemoveLeaf` and `ResizeFocused` are the split-tree operations,
`ComputeTabGeoms` and `NeighborInDirection` the layout math, and `DeriveScene`
and `DiffScene` build the frontend view and the delta the server sends.

## Screen Model

`vt.Terminal` takes raw PTY output and keeps the screen: cells with their
colours and attributes, the cursor and the style DECSCUSR gave it
(`Terminal.CursorStyle`), the alternate screen and the modes a frontend needs to
route input. `Terminal.LineRuns` returns a row as runs of cells that share their
style, which screen messages carry, and `vt.RunCells` expands runs back into the
cells of a row, as the TUI frontend does:

```go
term := vt.New(80, 24)
term.WriteString("\x1b[31mred\x1b[0m text")

fmt.Println(term.LineText(0))          // red text
fmt.Println(term.Cell(0, 0).Attrs.Fg)  // {1 1}: palette colour 1

cells := vt.RunCells(term.LineRuns(0), 80)
fmt.Println(cells[0] == term.Cell(0, 0)) // true
```

It is built to behave like xterm.js: the parser uses the xterm.js VT500
transition table and a resize re-wraps soft-wrapped lines the way it does. Cell
widths and grapheme clusters follow Unicode 15.1 instead of xterm.js's Unicode 6
tables (ADR 0006), and OSC 8 hyperlinks are kept per cell. Repeat and line
counts (REP, IL, DL, SU, SD, CHT, CBT) are bounded by the screen size, so a
program cannot make the terminal allocate or loop beyond what its screen holds.
A `vt.Terminal` is not safe for concurrent use.

### Unicode Widths and Grapheme Clusters

The width tables and grapheme cluster properties in `vt/unicode_tables.go` are
generated from the Unicode 15.1 Character Database by
`vt/gen_unicode_tables.go`, which records the version (`unicodeVersion`), the
URL and the SHA-256 of each data file. The data files are not in the repository:
the generator reads them from `etc/temp/muxfx-vt/ucd-15.1.0/`, downloads any
that are missing, and stops when a checksum differs. Regenerate the tables, and
the UAX #29 conformance cases in `vt/unicode_grapheme_cases_test.go`, from the
repository root with:

```sh
go generate ./pkg/ajan/muxfx/vt/
```

The rules:

- A code point is two columns wide when its East Asian Width is W or F or it has
  Emoji_Presentation; zero when it is a nonspacing, enclosing or format mark
  (Mn, Me, Cf), a grapheme extender, a zero width joiner or a Hangul medial
  vowel or final consonant; one otherwise. Ambiguous widths are narrow, and
  U+00AD SOFT HYPHEN is one column, as in glibc's `wcwidth` and xterm.js.
- Code points join into extended grapheme clusters by UAX #29, including the
  15.1 Indic conjunct rule GB9c. A cluster (`e` with accents, `👨‍👩‍👧`, `🇹🇷`, `👍🏽`,
  `#️⃣`) takes one cell, as wide as its widest part, and
  `Terminal.Cell(row, col).Content` holds all of it. VS16 (U+FE0F) after a
  character that has emoji variation sequences makes it two columns wide; VS15
  (U+FE0E) makes it one.
- A zero-width code point that starts no cluster, such as a combining mark after
  a control sequence or a zero width space, takes no cell: it is kept in the
  cell before the cursor, or dropped when there is none.
- A cluster keeps growing across writes, so a PTY read that ends inside one
  changes nothing; a control sequence ends it, as in xterm.js. One cell holds at
  most 256 bytes: the code points after that still join the cluster, but are not
  stored.

### Hyperlinks

`OSC 8 ; params ; URI ST` gives the cells printed after it a link, until an OSC
8 with an empty URI or the next link. `Cell.Link` is the link's id (0 for none)
and `Terminal.Link(id)` returns its `id=` parameter and URI; `Terminal.CellLink`
does both for a screen cell, and history runs carry the id in `Run.Link`. Parts
with the same `id=` parameter and URI share one id, so a frontend can highlight
them together:

```go
term.WriteString("\x1b]8;;https://example.com\x1b\\docs\x1b]8;;\x1b\\")

link, ok := term.CellLink(0, 0)
if ok && vt.IsSafeLinkURI(link.URI) {
	fmt.Println("open", link.URI) // open https://example.com
}
```

The link table holds at most 4096 links and 1 MiB of URIs and ids, and drops the
oldest past either; a cell whose link was dropped then has no link. URIs longer
than 2048 bytes are not stored, and the text after one has no link. The URI is
kept as the program sent it: programs choose link URIs freely, so a frontend
must check the scheme before it opens one. `vt.IsSafeLinkURI` reports whether a
URI is `http`, `https`, `mailto` or `file`; open anything else only when the
user agrees.

### Rows as Runs

`Terminal.LineRuns` returns a screen row as runs, the form history lines take
and the screen messages of ADR 0006 carry. A `vt.Run` is a stretch of cells with
the same attributes, hyperlink (`Link`) and cell width, of one of three kinds:

| Kind    | Fields             | Cells                                                                  |
| ------- | ------------------ | ---------------------------------------------------------------------- |
| Blank   | `Text` is `""`     | `Cells` empty cells; `Width` 0 marks leftovers of a cut wide character |
| Text    | `Cluster` is false | one cell of `Width` columns (1 or 2) per code point of `Text`          |
| Cluster | `Cluster` is true  | one cell of `Width` columns holding all of `Text`                      |

A wide cell covers the column to its right, and `Cells` counts both. The columns
after a row's last run are empty cells with the default attributes.
`vt.RunCells(runs, cols)` expands runs back into cells.

### History

Lines that scroll off the top of the normal screen become history; the alternate
screen keeps none. A terminal keeps `vt.DefaultScrollback` (5000) lines, the
browser dashboard's setting, unless `vt.WithScrollback` sets another count, and
`vt.WithScrollbackBytes` bounds their memory (`vt.DefaultScrollbackBytes`, 16
MiB); past either limit the oldest lines go. History lines are stored packed as
runs, not as one `Cell` per column. A resize re-wraps the history together with
the screen, as xterm.js does with its scrollback: a narrower screen pushes rows
into the history, and a taller one takes them back. ED 3 (`CSI 3 J`) and a full
reset (RIS) clear it.

`DrainHistory` reports what changed since the last call, so the server can send
the new lines with each frame. Without `Reset`, `Lines` are the lines added at
the bottom, oldest first. With `Reset`, the history was rewritten (a resize, ED
3 or RIS) and `Lines` holds all of it, which replaces a frontend's copy:

```go
term := vt.New(80, 24, vt.WithScrollback(1000))
term.WriteString(strings.Repeat("a line\r\n", 30))

var copied []vt.HistoryLine

update := term.DrainHistory()
if update.Reset {
	copied = nil
}

copied = append(copied, update.Lines...)

fmt.Println(len(copied)) // 7: 31 rows of output on a 24-row screen
fmt.Println(copied[0].Runs[0].Text) // a line

recent := term.History(term.HistoryLen()-100, term.HistoryLen()) // up to the last 100 lines
```

`HistoryLen` and `HistoryBytes` report the history's size as its limits count
it. `HistoryStamp` counts the lines ever added and the rewrites without draining
anything, so several consumers can follow the history: with the same `Rewrites`,
the lines added since an earlier stamp are the last `Added` minus its `Added`.
The server keeps one stamp per frontend this way.

### Memory

`BenchmarkHistoryMemory` in `vt/history_bench_test.go` fills the history of a
40-row pane with `vt.DefaultScrollback` lines and measures the heap the pane
holds, screen included. Measured with Go 1.26 on darwin/arm64:

| Output                        | 120 columns | 240 columns | One `Cell` per column (120 / 240) |
| ----------------------------- | ----------- | ----------- | --------------------------------- |
| Full-width plain text         | 1.6 MB      | 2.5 MB      | 33.6 MB / 67.2 MB                 |
| Short shell lines, one colour | 1.4 MB      | 1.7 MB      | 33.6 MB / 67.2 MB                 |
| Code with eight colour runs   | 2.9 MB      | 3.6 MB      | 33.6 MB / 67.2 MB                 |
| A different colour every cell | 17.5 MB     | 17.9 MB     | 20.6 MB / 20.7 MB                 |

A packed line costs 80 bytes, its text, and 44 bytes per run. With a different
colour in every cell the byte limit stops the history first, at 3061 lines (120
columns) or 1542 lines (240 columns); the last column compares those lines.
Reproduce the table with:

```sh
go test -run '^$' -bench BenchmarkHistoryMemory -benchtime 3x ./pkg/ajan/muxfx/vt/
```

### Fidelity Tests

The tests in `vt/snapshot_test.go` replay byte streams through the model and
compare each screen with a snapshot recorded from `@xterm/headless` 6.0.0 with
`@xterm/addon-unicode-graphemes` 0.4.0 active (its `15-graphemes` widths and
clusters): the text, width and style of every cell (colours, attributes,
underline style and colour, OSC 8 link), the cursor, whether it is hidden and
its DECSCUSR style, the wrapped rows, the alternate screen, the input modes and
the title. A case recorded with scrollback gives vt the same history limit, and
its snapshots also hold the history, read the same way; the others are recorded
at scrollback 0, as the TypeScript `VTerminal` configured it. Every stream is
replayed a second time one byte per write. Two fixtures hold the snapshots:

- `testdata/vt_snapshots.json`: synthetic streams, one feature each: text and
  wrapping, cursor movement and styles (DECSCUSR), erasing, SGR, scroll regions,
  the alternate screen, tabs, control characters, UTF-8 and wide characters,
  grapheme clusters (ZWJ sequences, flags, skin tones, variation selectors,
  combining marks, Hangul jamo, clusters at the right edge, in REP and in a
  reflow), OSC 8 links, resizes, the history (lines scrolling into it, its line
  limit, re-wrapping on resize, rows coming back on a taller screen, scroll
  regions, ED 3, RIS, the saved cursor and the alternate screen), and a
  regression case for each bug the corpus and the differential runs found.
- `testdata/vt_corpus.json.gz`: real programs recorded on a pseudo-terminal at
  two or more sizes each, resized while they run: Claude Code (the trust prompt,
  `/help`, a long prompt typed and never sent), vim with splits and syntax
  colours, less over a long file, top, git's pager, and zsh and sh sessions with
  colours, wide characters and long output (a 400-line coloured file, git log,
  `clear`). Every stream is recorded twice, at scrollback 0 and as
  `<name>-scrollback` at 200 lines, so the long ones fill the history and drop
  lines while resizes re-wrap it. It is gzipped because its JSON is larger than
  900 KB.

Moving from xterm.js's Unicode 6 tables to Unicode 15.1 changed the snapshots of
22 corpus cases: every Claude Code, vim split, less over the long file, zsh
colour and long-output case, in both scrollback variants. The reason is the same
in all of them: 🙂, 🎉 and 👍 have Emoji_Presentation and now take two columns,
and the cursor and wrapping follow. Six synthetic cases changed: `utf8-emoji`,
`history-wide-styles-erase` and `history-combining-widens-at-wrap` (emoji and
VS16 sequences take two columns), `reflow-moves-combined-chars` (its input now
uses narrow combined characters, so it still shows the reflow defect), and
`zero-width-in-pending-wrap` and `rep-after-resize-lone-combining` (listed
below).

`knownDivergences` in the test lists every case where vt does not copy the
reference, with the reason, and `TestKnownDivergences` checks what vt does
instead against a hand-checked screen. The corpus of real programs has none.
These are xterm.js defects that synthetic or random streams exposed:

- a narrowing reflow at scrollback 0 that reaches rows outside xterm.js's ring
  buffer, after which it shows stale or repeated rows; the recorder flags these
  snapshots, and the replay fails on a flagged case that is not listed. Without
  history vt drops the row pushed off the top; with history the row goes into
  it, and xterm.js at scrollback 10 agrees
  (`resize-reflow-wide-chars-scrollback`)
- ED 1 with the cursor in the last column, which in xterm.js unwraps the row
  `y + 1` counted from the top of its scrollback instead of the screen, so with
  history it unwraps a history line
- SGR 59, which xterm.js turns into a white underline
- DECALN, which loses the underline style in xterm.js
- RIS, after which xterm.js keeps the cursor hidden
- autowrap on a one-row screen, where xterm.js clears the wrapped row's tail in
  the new row
- a reflow that moves combined characters (a base with combining marks or a
  variation selector) that xterm.js did not copy, overwriting others
- DECRC, after which xterm.js stops giving printed text the open OSC 8 link
  until an SGR sets its extended-attributes bit again; a link is not part of the
  saved cursor in vt
- an OSC 8 with parameters and an empty URI, which xterm.js ignores; vt ends the
  link, as an empty URI means
- an OSC 8 URI longer than 2048 bytes, which xterm.js stores and vt does not

These are places where the unicode-graphemes addon does not follow Unicode 15.1:

- a zero-width character that starts no cluster (a combining mark after a
  control sequence, a zero width space, a bidirectional mark): the addon gives
  it a cell one column wide; vt keeps it in the cell before the cursor
  (`zero-width-in-pending-wrap`, `rep-after-resize-lone-combining`,
  `unicode-zero-width-takes-no-cell`)
- VS15 after a character with emoji variation sequences, which the addon leaves
  two columns wide (`unicode-text-selector-narrows`)
- VS16 after a character without emoji variation sequences, which the addon
  widens (`unicode-emoji-selector-needs-a-base`)
- GB11, which joins a pictograph after a zero width joiner only when a
  pictograph came before the joiner; the addon joins after any joiner
  (`unicode-zwj-needs-a-pictograph`)
- GB9c, the 15.1 Indic conjunct rule, which the addon lacks
  (`unicode-indic-conjunct`)
- a regional indicator without a pair, which has Emoji_Presentation and is two
  columns wide; the addon makes it one (`unicode-lone-regional-indicator`)

`FuzzTerminalWrite` in `vt/fuzz_test.go` feeds arbitrary bytes and a resize to a
terminal of arbitrary size and history limit, and checks that nothing panics,
the cursor stays on the screen, a cell holds at most 256 bytes and its link
resolves, every row's runs expand back to its cells and the history stays within
its limits. Its seeds are the fixture streams, and the inputs it found are kept
in `vt/testdata/fuzz` as regression cases. Run it from the repository root:

```sh
go test -run '^$' -fuzz FuzzTerminalWrite -fuzztime 10m ./pkg/ajan/muxfx/vt/
```

The fixtures are recorded with two scripts kept outside the repository's tracked
files, in `etc/temp/muxfx-vt/`. `capture-pty.py` runs each program on a
pseudo-terminal under `/tmp/vt-corpus` (`HOME` is `/tmp/vt-corpus/home`), a
neutral path with no user name, uid or session id, since programs print it, and
removes it afterwards. It plays scripted keys and resizes, replaces the user
name in the output with a placeholder of the same length, and writes nothing
when a stream still holds the user or host name, a UUID-shaped session id,
`claude-<digits>/` or `/private/tmp/claude`. `record-vt-snapshots.mjs` replays
every stream through `@xterm/headless` and writes both fixtures. It loads
`@xterm/addon-unicode-graphemes` from a scratch copy in
`etc/temp/muxfx-vt/node_modules`, which no workspace package depends on; with
`--cases cases.json out.json` it records a list of cases into one file instead,
which a differential run of random streams uses:

```sh
python3 etc/temp/muxfx-vt/capture-pty.py etc/temp/muxfx-vt/captures.json
node etc/temp/muxfx-vt/record-vt-snapshots.mjs etc/temp/muxfx-vt/captures.json pkg/ajan/muxfx/testdata
```

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/muxfx`: the API reference generated
  from source
- [ajan/shellfx](../shellfx/): the pseudo-terminal and terminal input packages
  this one builds on
- [eser/stack on GitHub](https://github.com/eser/stack)
