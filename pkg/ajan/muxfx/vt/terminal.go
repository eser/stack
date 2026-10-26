// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package vt is a headless terminal emulator: write raw PTY output into a
// [Terminal] and read back the screen, cell by cell, with the cursor and
// modes.
//
// It replaces @xterm/headless, which the TypeScript VTerminal wrapped, and is
// built to the same behaviour: the parser uses xterm.js's VT500 transition
// table and a resize reflows soft-wrapped lines the way it does. Cell widths
// and grapheme clusters follow Unicode 15.1 rather than xterm.js's Unicode 6
// tables (see width.go): a cluster such as an emoji sequence or a flag takes
// one cell, two columns wide.
//
// Lines that scroll off the top of the normal screen become history, kept as
// runs of text and attributes ([HistoryLine]) and bounded by a line count
// ([WithScrollback], [DefaultScrollback]) and a byte count
// ([WithScrollbackBytes]). A resize re-wraps the history with the screen, as
// xterm.js does with its scrollback. [Terminal.DrainHistory] reports the
// lines added since the last call.
//
// A Terminal is not safe for concurrent use; the owner serializes access.
package vt

import "strconv"

const (
	minCols = 2
	minRows = 1
)

// Cursor is the cursor position, 0-based. X equals the width while a
// character written into the last column waits to wrap.
type Cursor struct {
	X      int  `json:"x"`
	Y      int  `json:"y"`
	Hidden bool `json:"hidden"`
}

// MouseProtocol is the mouse reporting a program asked for (DECSET 9, 1000,
// 1002, 1003).
type MouseProtocol uint8

const (
	// MouseNone means no mouse reporting.
	MouseNone MouseProtocol = iota
	// MouseX10 reports button presses (DECSET 9).
	MouseX10
	// MouseVT200 reports presses and releases (DECSET 1000).
	MouseVT200
	// MouseDrag also reports motion while a button is held (DECSET 1002).
	MouseDrag
	// MouseAny reports all motion (DECSET 1003).
	MouseAny
)

// MouseEncoding is how mouse reports are encoded (DECSET 1006, 1016).
type MouseEncoding uint8

const (
	// MouseEncodingDefault is the legacy X10 byte encoding.
	MouseEncodingDefault MouseEncoding = iota
	// MouseEncodingSGR is DECSET 1006.
	MouseEncodingSGR
	// MouseEncodingSGRPixels is DECSET 1016.
	MouseEncodingSGRPixels
)

// Modes are the terminal modes a frontend needs to route input: what the
// cursor and keypad keys send, whether pastes are bracketed and which mouse
// reports the program wants.
type Modes struct {
	ApplicationCursorKeys bool          `json:"applicationCursorKeys"`
	ApplicationKeypad     bool          `json:"applicationKeypad"`
	BracketedPaste        bool          `json:"bracketedPaste"`
	SendFocus             bool          `json:"sendFocus"`
	MouseProtocol         MouseProtocol `json:"mouseProtocol"`
	MouseEncoding         MouseEncoding `json:"mouseEncoding"`
	Insert                bool          `json:"insert"`
	Origin                bool          `json:"origin"`
	Wraparound            bool          `json:"wraparound"`
	ReverseWraparound     bool          `json:"reverseWraparound"`
	SynchronizedOutput    bool          `json:"synchronizedOutput"`
	CursorHidden          bool          `json:"cursorHidden"`
}

func defaultModes() Modes {
	return Modes{Wraparound: true}
}

// Option configures a [Terminal].
type Option func(*Terminal)

// WithReplyWriter receives the replies a program asks the terminal for:
// cursor position (DSR 6), status (DSR 5) and device attributes (DA1, DA2).
// Without it, those requests are ignored, as the TypeScript VTerminal ignored
// them. The function runs during Write and must not call back into the
// Terminal.
func WithReplyWriter(fn func(reply []byte)) Option {
	return func(t *Terminal) {
		t.reply = fn
	}
}

// Terminal is the emulator state: two screens, the parser and the current
// attributes.
type Terminal struct {
	cols, rows int

	normal *buffer
	alt    *buffer
	active *buffer

	parser   *parser
	decoder  utf8Decoder
	decoded  []rune
	join     joinState
	cur      Attrs
	modes    Modes
	charsets charsetState
	lnm      bool
	title    string
	reply    func([]byte)

	scrollback      int
	scrollbackBytes int
	history         *history

	// link is the OSC 8 link printed cells get; links resolves link ids.
	link  uint32
	links *linkTable

	cursorStyle CursorStyle
}

// New creates a blank terminal of cols x rows cells. Sizes below 2 columns or
// 1 row are raised to those minimums. It keeps [DefaultScrollback] lines of
// history unless [WithScrollback] says otherwise.
func New(cols, rows int, opts ...Option) *Terminal {
	t := &Terminal{
		cols:            max(cols, minCols),
		rows:            max(rows, minRows),
		scrollback:      DefaultScrollback,
		scrollbackBytes: DefaultScrollbackBytes,
	}

	for _, opt := range opts {
		opt(t)
	}

	t.history = newHistory(t.scrollback, t.scrollbackBytes)
	t.links = newLinkTable()
	t.parser = newParser(t)
	t.resetState()

	return t
}

// resetState builds fresh screens and modes and drops the history, as a full
// reset (RIS) does. LNM and the title survive it, as in xterm.js, which keeps
// LNM as an option and leaves the title to the next OSC 0 or 2.
func (t *Terminal) resetState() {
	t.history.clear()
	t.links.clear()
	t.link = 0
	t.normal = newBuffer(t.cols, t.rows, true, t.history)
	t.normal.fillViewportRows(Attrs{})
	t.alt = newBuffer(t.cols, t.rows, false, nil)
	t.active = t.normal
	t.cur = Attrs{}
	t.modes = defaultModes()
	t.cursorStyle = CursorStyle{}
	t.charsets.reset()
	t.join = joinState{}
}

// Write feeds raw PTY output to the terminal. It never fails; the error is
// there to satisfy io.Writer.
func (t *Terminal) Write(p []byte) (int, error) {
	t.decoded = t.decoder.decode(p, t.decoded[:0])
	t.parser.parse(t.decoded)

	return len(p), nil
}

// WriteString is Write for a string.
func (t *Terminal) WriteString(s string) {
	_, _ = t.Write([]byte(s))
}

// Resize changes the size to cols x rows. The normal screen reflows
// soft-wrapped lines to the new width; the scroll region is reset. Resizing
// to the current size changes nothing, as in xterm.js: a cursor waiting to
// wrap keeps waiting and the scroll region stays.
func (t *Terminal) Resize(cols, rows int) {
	if cols == t.cols && rows == t.rows {
		return
	}

	cols = max(cols, minCols)
	rows = max(rows, minRows)

	t.normal.resize(cols, rows)
	t.alt.resize(cols, rows)
	t.normal.setupTabStops(cols)
	t.alt.setupTabStops(cols)

	t.cols = cols
	t.rows = rows
}

// Cols is the width in cells.
func (t *Terminal) Cols() int {
	return t.cols
}

// Rows is the height in cells.
func (t *Terminal) Rows() int {
	return t.rows
}

// Cursor returns the cursor position and whether the program hid it.
func (t *Terminal) Cursor() Cursor {
	return Cursor{X: t.active.x, Y: t.active.y, Hidden: t.modes.CursorHidden}
}

// AltScreen reports whether the alternate screen is active.
func (t *Terminal) AltScreen() bool {
	return t.active == t.alt
}

// Modes returns the current terminal modes.
func (t *Terminal) Modes() Modes {
	return t.modes
}

// Title is the window title last set with OSC 0 or OSC 2.
func (t *Terminal) Title() string {
	return t.title
}

// Cell returns the cell at row, col of the visible screen. Out-of-range
// positions return an empty cell.
func (t *Terminal) Cell(row, col int) Cell {
	if row < 0 || row >= t.rows || col < 0 || col >= t.cols {
		return emptyCell(Attrs{})
	}

	return t.active.line(row).cells[col]
}

// LineText returns a row as text without trailing empty cells. A wide
// character appears once; empty cells inside the row are spaces.
func (t *Terminal) LineText(row int) string {
	if row < 0 || row >= t.rows {
		return ""
	}

	return t.active.line(row).trimmedText()
}

// LineWrapped reports whether a row continues the row above it because the
// text wrapped there, rather than after a line feed.
func (t *Terminal) LineWrapped(row int) bool {
	if row < 0 || row >= t.rows {
		return false
	}

	return t.active.line(row).wrapped
}

func (t *Terminal) sendReply(s string) {
	if t.reply != nil {
		t.reply([]byte(s))
	}
}

// --- parser callbacks -------------------------------------------------------

func (t *Terminal) resetJoinState() {
	t.join = joinState{}
}

func (t *Terminal) execute(code rune) {
	switch code {
	case 0x07: // BEL
	case 0x0a, 0x0b, 0x0c: // LF, VT, FF
		t.lineFeed()
	case 0x0d:
		t.active.x = 0
	case 0x08:
		t.backspace()
	case 0x09:
		t.tab()
	case 0x0e: // SO
		t.charsets.setGLevel(1)
	case 0x0f: // SI
		t.charsets.setGLevel(0)
	case 0x84: // IND
		t.index()
	case 0x85: // NEL
		t.active.x = 0
		t.index()
	case 0x88: // HTS
		t.active.tabs[t.active.x] = true
	}
}

func (t *Terminal) oscDispatch(id int, data string) {
	switch id {
	case 0, 2:
		t.title = data
	case 8:
		t.setHyperlink(data)
	}
}

func (t *Terminal) escDispatch(collect int, final rune) {
	if collect == 0 {
		t.escPlain(final)

		return
	}

	if collect > 0xff {
		return
	}

	intermediate := byte(collect)

	switch {
	case intermediate == '#' && final == '8':
		t.screenAlignmentPattern()
	case intermediate == '%' && (final == '@' || final == 'G'):
		t.selectDefaultCharset()
	case intermediate == '/':
	default:
		g, ok := gLevelFor(intermediate)
		if !ok || final > 0x7f {
			return
		}

		cs, known := charsetFor(byte(final))
		if !known {
			return
		}

		t.charsets.setGCharset(g, cs)
	}
}

func (t *Terminal) escPlain(final rune) {
	switch final {
	case '7':
		t.saveCursor()
	case '8':
		t.restoreCursor()
	case 'D':
		t.index()
	case 'E':
		t.active.x = 0
		t.index()
	case 'H':
		t.active.tabs[t.active.x] = true
	case 'M':
		t.reverseIndex()
	case '=':
		t.modes.ApplicationKeypad = true
	case '>':
		t.modes.ApplicationKeypad = false
	case 'c':
		t.fullReset()
	case 'n':
		t.charsets.setGLevel(2)
	case 'o', '|':
		t.charsets.setGLevel(3)
	case '}':
		t.charsets.setGLevel(2)
	case '~':
		t.charsets.setGLevel(1)
	}
}

func (t *Terminal) selectDefaultCharset() {
	t.charsets.setGLevel(0)
	t.charsets.setGCharset(0, nil)
}

func (t *Terminal) fullReset() {
	t.parser.reset()
	t.resetState()
}

func (t *Terminal) csiDispatch(collect int, final rune, p *params) {
	switch collect {
	case 0:
		t.csiPlain(final, p)
	case '?':
		t.csiPrivate(final, p)
	case '>':
		if final == 'c' && p.at(0) <= 0 {
			t.sendReply("\x1b[>0;276;0c")
		}
	case '!':
		if final == 'p' {
			t.softReset()
		}
	case ' ':
		switch final {
		case '@':
			t.shiftColumns(0, p.atOrOne(0), false)
		case 'A':
			t.shiftColumns(0, p.atOrOne(0), true)
		case 'q':
			t.setCursorStyle(p)
		}
	case '\'':
		switch final {
		case '}':
			t.shiftColumns(t.active.x, p.atOrOne(0), true)
		case '~':
			t.shiftColumns(t.active.x, p.atOrOne(0), false)
		}
	}
}

func (t *Terminal) csiPrivate(final rune, p *params) {
	switch final {
	case 'h':
		t.setModePrivate(p, true)
	case 'l':
		t.setModePrivate(p, false)
	case 'J':
		t.eraseInDisplay(p.at(0))
	case 'K':
		t.eraseInLine(p.at(0))
	case 'n':
		if p.at(0) == 6 {
			t.sendReply("\x1b[?" + strconv.Itoa(t.active.y+1) + ";" + strconv.Itoa(t.active.x+1) + "R")
		}
	}
}

func (t *Terminal) csiPlain(final rune, p *params) {
	b := t.active

	switch final {
	case '@':
		t.insertChars(p.atOrOne(0))
	case 'A':
		t.cursorUp(p.atOrOne(0))
	case 'B':
		t.cursorDown(p.atOrOne(0))
	case 'C', 'a':
		t.moveCursor(p.atOrOne(0), 0)
	case 'D':
		t.moveCursor(-p.atOrOne(0), 0)
	case 'E':
		t.cursorDown(p.atOrOne(0))
		b.x = 0
	case 'F':
		t.cursorUp(p.atOrOne(0))
		b.x = 0
	case 'G', '`':
		t.setCursor(p.atOrOne(0)-1, b.y)
	case 'H', 'f':
		col := 0
		if p.length() >= 2 {
			col = p.atOrOne(1) - 1
		}

		t.setCursor(col, p.atOrOne(0)-1)
	case 'I':
		t.cursorForwardTab(p.atOrOne(0))
	case 'J':
		t.eraseInDisplay(p.at(0))
	case 'K':
		t.eraseInLine(p.at(0))
	case 'L':
		t.insertLines(p.atOrOne(0))
	case 'M':
		t.deleteLines(p.atOrOne(0))
	case 'P':
		t.deleteChars(p.atOrOne(0))
	case 'S':
		t.scrollUp(p.atOrOne(0))
	case 'T':
		t.scrollDown(p.atOrOne(0))
	case 'X':
		t.eraseChars(p.atOrOne(0))
	case 'Z':
		t.cursorBackwardTab(p.atOrOne(0))
	case 'b':
		t.repeatPrecedingCharacter(p.atOrOne(0))
	case 'c':
		if p.at(0) <= 0 {
			t.sendReply("\x1b[?1;2c")
		}
	case 'd':
		t.setCursor(b.x, p.atOrOne(0)-1)
	case 'e':
		t.moveCursor(0, p.atOrOne(0))
	case 'g':
		switch p.at(0) {
		case 0:
			delete(b.tabs, b.x)
		case 3:
			b.tabs = map[int]bool{}
		}
	case 'h':
		t.setMode(p, true)
	case 'l':
		t.setMode(p, false)
	case 'm':
		t.charAttributes(p)
	case 'n':
		t.deviceStatus(p.at(0))
	case 'r':
		t.setScrollRegion(p)
	case 's':
		t.saveCursor()
	case 'u':
		t.restoreCursor()
	}
}

func (t *Terminal) deviceStatus(n int) {
	switch n {
	case 5:
		t.sendReply("\x1b[0n")
	case 6:
		t.sendReply("\x1b[" + strconv.Itoa(t.active.y+1) + ";" + strconv.Itoa(t.active.x+1) + "R")
	}
}

func (t *Terminal) setMode(p *params, on bool) {
	for i := range p.length() {
		switch p.at(i) {
		case 4:
			t.modes.Insert = on
		case 20:
			t.lnm = on
		}
	}
}

func (t *Terminal) setModePrivate(p *params, on bool) {
	for i := range p.length() {
		mode := p.at(i)

		switch mode {
		case 1:
			t.modes.ApplicationCursorKeys = on
		case 2:
			if on {
				for g := range 4 {
					t.charsets.setGCharset(g, nil)
				}
			}
		case 6:
			t.modes.Origin = on
			t.setCursor(0, 0)
		case 7:
			t.modes.Wraparound = on
		case 45:
			t.modes.ReverseWraparound = on
		case 66:
			t.modes.ApplicationKeypad = on
		case 9, 1000, 1002, 1003:
			t.setMouseProtocol(mode, on)
		case 1004:
			t.modes.SendFocus = on
		case 1006:
			t.modes.MouseEncoding = MouseEncodingDefault
			if on {
				t.modes.MouseEncoding = MouseEncodingSGR
			}
		case 1016:
			t.modes.MouseEncoding = MouseEncodingDefault
			if on {
				t.modes.MouseEncoding = MouseEncodingSGRPixels
			}
		case 25:
			t.modes.CursorHidden = !on
		case 1048:
			if on {
				t.saveCursor()
			} else {
				t.restoreCursor()
			}
		case 47, 1047, 1049:
			t.switchScreen(mode, on)
		case 2004:
			t.modes.BracketedPaste = on
		case 2026:
			t.modes.SynchronizedOutput = on
		}
	}
}

func (t *Terminal) setMouseProtocol(mode int, on bool) {
	if !on {
		t.modes.MouseProtocol = MouseNone

		return
	}

	switch mode {
	case 9:
		t.modes.MouseProtocol = MouseX10
	case 1000:
		t.modes.MouseProtocol = MouseVT200
	case 1002:
		t.modes.MouseProtocol = MouseDrag
	case 1003:
		t.modes.MouseProtocol = MouseAny
	}
}

// switchScreen enters or leaves the alternate screen. Mode 1049 also saves and
// restores the cursor. Leaving clears the alternate screen, and the normal
// screen takes over the alternate screen's cursor position (before a 1049
// restore), as in xterm.js.
func (t *Terminal) switchScreen(mode int, on bool) {
	if on {
		if mode == 1049 {
			t.saveCursor()
		}

		if t.active != t.alt {
			t.alt.fillViewportRows(t.cur.eraseAttrs())
			t.alt.x = t.normal.x
			t.alt.y = t.normal.y
			t.active = t.alt
		}

		return
	}

	if t.active != t.normal {
		t.normal.x = t.alt.x
		t.normal.y = t.alt.y
		t.alt.clear()
		t.active = t.normal
	}

	if mode == 1049 {
		t.restoreCursor()
	}
}

func (t *Terminal) softReset() {
	b := t.active
	mouse, encoding := t.modes.MouseProtocol, t.modes.MouseEncoding
	t.modes = defaultModes()
	t.modes.MouseProtocol = mouse
	t.modes.MouseEncoding = encoding
	t.cursorStyle = CursorStyle{}
	b.scrollTop = 0
	b.scrollBottom = t.rows - 1
	t.cur = Attrs{}
	t.link = 0
	t.charsets.reset()
	b.savedX = 0
	b.savedY = b.absoluteBase()
	b.savedAttrs = Attrs{}
	b.savedCharset = nil
}

func (t *Terminal) setScrollRegion(p *params) {
	top := p.atOrOne(0)

	bottom := t.rows
	if p.length() >= 2 {
		if v := p.at(1); v != 0 && v <= t.rows {
			bottom = v
		}
	}

	if bottom > top {
		t.active.scrollTop = top - 1
		t.active.scrollBottom = bottom - 1
		t.setCursor(0, 0)
	}
}

func (t *Terminal) saveCursor() {
	b := t.active
	b.savedX = b.x
	b.savedY = b.absoluteBase() + b.y
	b.savedAttrs = t.cur
	b.savedCharset = t.charsets.active
}

func (t *Terminal) restoreCursor() {
	b := t.active
	b.x = b.savedX
	b.y = max(b.savedY-b.absoluteBase(), 0)

	// xterm.js restores the colours and flags only; the underline style and
	// colour (its extended attributes) stay as they are.
	underline, underlineColor := t.cur.Underline, t.cur.UnderlineColor
	t.cur = b.savedAttrs
	t.cur.Underline = underline
	t.cur.UnderlineColor = underlineColor
	t.charsets.active = b.savedCharset

	t.restrictCursor(t.cols - 1)
}

func (t *Terminal) screenAlignmentPattern() {
	fill := Cell{Content: "E", Width: 1, Attrs: t.cur}

	t.setCursor(0, 0)

	for row := t.active.y; row < t.rows; row++ {
		l := t.active.line(row)
		l.fill(fill)
		l.wrapped = false
	}

	t.setCursor(0, 0)
}
