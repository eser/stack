// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

const tabStopWidth = 8

// buffer is one screen (normal or alternate): its rows, cursor, scroll region,
// saved cursor and tab stops. The row list holds maxLength rows, normally the
// screen height. A line that scrolls off the top goes to hist, the normal
// screen's history; the alternate screen has none, and its lines are gone.
//
// Together, hist and lines are xterm.js's row list: history lines first,
// then the screen, maxLength plus the history's line limit long. ybase is the
// index of the top screen row in lines. It becomes non-zero while a resize
// reflows wrapped lines, which works on the whole list, and on an alternate
// screen that was shrunk while empty: its list keeps the larger height until
// it is cleared, so its first scrolls move ybase instead of dropping rows, as
// in xterm.js. savedY is an index in the whole list, as in xterm.js, so a
// restored cursor moves up with the lines that scrolled into history.
type buffer struct {
	lines     []*line
	maxLength int
	cols      int
	rows      int

	hist *history

	// spare is the last row that left the list, kept so the next blank row
	// reuses its cells instead of allocating a row per scroll.
	spare *line

	x, y         int
	ybase        int
	scrollTop    int
	scrollBottom int

	savedX       int
	savedY       int
	savedAttrs   Attrs
	savedCharset charset

	tabs map[int]bool

	// reflow is true for the normal screen: on a width change its soft-wrapped
	// lines are re-wrapped to the new width. The alternate screen is redrawn by
	// its program instead.
	reflow bool
}

func newBuffer(cols, rows int, reflow bool, hist *history) *buffer {
	b := &buffer{
		cols:         cols,
		rows:         rows,
		maxLength:    rows,
		scrollBottom: rows - 1,
		reflow:       reflow,
		hist:         hist,
	}
	b.setupTabStops(-1)

	return b
}

// fillViewportRows creates the rows of an empty buffer.
func (b *buffer) fillViewportRows(fill Attrs) {
	if len(b.lines) != 0 {
		return
	}

	for range b.rows {
		b.lines = append(b.lines, b.blankLine(fill, false))
	}
}

// clear drops every row and resets the cursor and scroll region; the
// alternate screen is cleared like this each time it is left.
func (b *buffer) clear() {
	b.ybase = 0
	b.x = 0
	b.y = 0
	b.lines = nil
	b.maxLength = b.rows
	b.scrollTop = 0
	b.scrollBottom = b.rows - 1
	b.setupTabStops(-1)
}

func (b *buffer) blankLine(attrs Attrs, wrapped bool) *line {
	if l := b.spare; l != nil && len(l.cells) == b.cols {
		b.spare = nil
		l.fill(emptyCell(attrs))
		l.wrapped = wrapped

		return l
	}

	return newLine(b.cols, emptyCell(attrs), wrapped)
}

// recycle keeps a row that left the list as the spare.
func (b *buffer) recycle(l *line) {
	if !l.packed && len(l.cells) == b.cols {
		b.spare = l
	}
}

// line returns the row at viewport position y.
func (b *buffer) line(y int) *line {
	return b.lines[b.ybase+y]
}

// setupTabStops places a stop every eight columns. With from >= 0 it only
// extends the stops from the last one before from, keeping stops the program
// set; with from < 0 it starts over.
func (b *buffer) setupTabStops(from int) {
	i := from
	if i >= 0 {
		if !b.tabs[i] {
			i = b.prevStop(i)
		}
	} else {
		b.tabs = map[int]bool{}
		i = 0
	}

	for ; i < b.cols; i += tabStopWidth {
		b.tabs[i] = true
	}
}

func (b *buffer) clampCol(x int) int {
	switch {
	case x >= b.cols:
		return b.cols - 1
	case x < 0:
		return 0
	default:
		return x
	}
}

func (b *buffer) prevStop(x int) int {
	for {
		x--
		if b.tabs[x] || x <= 0 {
			break
		}
	}

	return b.clampCol(x)
}

func (b *buffer) nextStop(x int) int {
	for {
		x++
		if b.tabs[x] || x >= b.cols {
			break
		}
	}

	return b.clampCol(x)
}

// historyLen is the number of history lines above the row list.
func (b *buffer) historyLen() int {
	if b.hist == nil {
		return 0
	}

	return b.hist.count
}

// absoluteBase is ybase in the whole list, history included: what xterm.js
// calls ybase.
func (b *buffer) absoluteBase() int {
	return b.historyLen() + b.ybase
}

// insertLine inserts l at index i. When the list is full its top row leaves
// it: into the history, or gone on a screen without one.
func (b *buffer) insertLine(i int, l *line) {
	b.lines = append(b.lines, nil)
	copy(b.lines[i+1:], b.lines[i:])
	b.lines[i] = l

	if len(b.lines) > b.maxLength {
		trim := len(b.lines) - b.maxLength
		for k := range trim {
			b.retire(b.lines[k])
			b.lines[k] = nil
		}

		b.lines = b.lines[trim:]
	}
}

// retire moves a row that left the top of the list into the history.
//
// While the history has room, xterm.js grows its list and ybase, so the saved
// cursor's row moves up with the text; once full, it drops its oldest line
// and ybase stays. The history count plays ybase's part here, and when the
// byte limit drops more lines than one, savedY moves by the extra ones so the
// saved row stays where it was relative to the screen.
func (b *buffer) retire(l *line) {
	defer b.recycle(l)

	if b.hist == nil {
		return
	}

	expected := 0
	if b.hist.count >= b.hist.maxLines {
		expected = 1
	}

	if extra := b.hist.push(l) - expected; extra > 0 {
		b.savedY = max(b.savedY-extra, 0)
	}
}

// clearHistory drops the history and any rows above the screen (ED 3).
func (b *buffer) clearHistory() {
	if b.hist != nil {
		b.hist.clear()
	}

	if extra := len(b.lines) - b.rows; extra > 0 {
		clear(b.lines[:extra])
		b.lines = b.lines[extra:]
		b.ybase = max(b.ybase-extra, 0)
	}
}

func (b *buffer) deleteLine(i int) {
	b.recycle(b.lines[i])
	b.lines = append(b.lines[:i], b.lines[i+1:]...)
	b.lines[len(b.lines):cap(b.lines)][0] = nil
}

// scroll moves the scroll region up one row and adds a blank row at its
// bottom.
func (b *buffer) scroll(erase Attrs, wrapped bool) {
	top := b.ybase + b.scrollTop
	bottom := b.ybase + b.scrollBottom
	blank := b.blankLine(erase, wrapped)

	if b.scrollTop == 0 {
		full := len(b.lines) >= b.maxLength
		b.insertLine(bottom+1, blank)

		if !full {
			// Nothing was dropped from the top: the screen moves down the
			// list instead.
			b.ybase++
		}

		return
	}

	b.deleteLine(top)
	b.insertLine(bottom, blank)
}

// resize changes the buffer to newCols x newRows, reflowing soft-wrapped
// lines on the normal screen.
//
// The history takes part as it does in xterm.js: its lines join the row list
// for the resize, so they re-wrap to the new width, rows taken off the top of
// the screen go into it and rows a taller screen needs come back from it.
// Afterwards the rows above the screen are the history again.
func (b *buffer) resize(newCols, newRows int) {
	nullCell := emptyCell(Attrs{})
	b.spare = nil

	scrollback := 0
	hadHistory := false

	if b.hist != nil {
		scrollback = b.hist.maxLines
		hadHistory = b.hist.count > 0

		if hadHistory {
			b.lines = append(b.hist.lines(), b.lines...)
			b.ybase += b.hist.count
		}

		b.maxLength += scrollback
	}

	newMaxLength := newRows + scrollback

	if newMaxLength > b.maxLength {
		b.maxLength = newMaxLength
	}

	if len(b.lines) > 0 {
		if b.cols < newCols {
			for _, l := range b.lines {
				l.resize(newCols, nullCell)
			}
		}

		addToY := b.resizeRows(newCols, newRows)

		if newMaxLength < b.maxLength {
			if trim := len(b.lines) - newMaxLength; trim > 0 {
				b.lines = b.lines[trim:]
				b.ybase = max(b.ybase-trim, 0)
				b.savedY = max(b.savedY-trim, 0)
			}

			b.maxLength = newMaxLength
		}

		b.x = min(b.x, newCols-1)
		b.y = min(b.y, newRows-1)
		b.y += addToY
		b.savedX = min(b.savedX, newCols-1)
		b.scrollTop = 0
	}

	b.scrollBottom = newRows - 1

	if b.reflow {
		b.reflowTo(newCols, newRows)

		if b.cols > newCols {
			for _, l := range b.lines {
				l.resize(newCols, nullCell)
			}
		}
	}

	b.cols = newCols
	b.rows = newRows
	b.normalize()

	if b.hist != nil {
		b.splitHistory(scrollback, hadHistory)
	}
}

// splitHistory makes the rows above the screen the history again after a
// resize, and the rest the screen.
func (b *buffer) splitHistory(scrollback int, hadHistory bool) {
	above := b.lines[:b.ybase]
	rows := len(b.lines) - b.ybase
	screen := make([]*line, rows, max(rows, b.maxLength-scrollback)+1)
	copy(screen, b.lines[b.ybase:])

	for _, l := range screen {
		l.unpack()
	}

	if hadHistory || len(above) > 0 {
		if dropped := b.hist.replace(above); dropped > 0 {
			b.savedY = max(b.savedY-dropped, 0)
		}
	}

	b.lines = screen
	b.ybase = 0
	b.maxLength -= scrollback
}

// resizeRows adds or removes rows for a height change. It returns how far the
// cursor moved down because rows came back from above.
func (b *buffer) resizeRows(newCols, newRows int) int {
	addToY := 0

	if b.rows < newRows {
		for y := b.rows; y < newRows; y++ {
			if len(b.lines) >= newRows+b.ybase {
				continue
			}

			if b.ybase > 0 && len(b.lines) <= b.ybase+b.y+addToY+1 {
				b.ybase--
				addToY++

				continue
			}

			b.lines = append(b.lines, newLine(newCols, emptyCell(Attrs{}), false))

			// A full circular list drops its top row on a push and keeps
			// ybase. An alternate screen shrunk while empty and filled since
			// has rows above its screen and reaches this; normalize then
			// moves the screen back inside the list.
			if len(b.lines) > b.maxLength {
				b.lines[0] = nil
				b.lines = b.lines[1:]
			}
		}

		return addToY
	}

	for y := b.rows; y > newRows; y-- {
		if len(b.lines) <= newRows+b.ybase {
			continue
		}

		if len(b.lines) > b.ybase+b.y+1 {
			// A row below the cursor goes first.
			b.lines = b.lines[:len(b.lines)-1]
		} else {
			// The cursor is on the last row: push the top row out instead.
			b.ybase++
		}
	}

	return addToY
}

// normalize keeps the viewport inside the rows that exist. A reflow can leave
// ybase past what a buffer without scrollback holds; xterm.js would then read
// rows that are not there. An empty buffer (the alternate screen before it is
// entered) stays empty, so entering it fills its rows with the erase colour
// then, as in xterm.js.
func (b *buffer) normalize() {
	if len(b.lines) == 0 {
		return
	}

	for len(b.lines) < b.rows {
		b.lines = append(b.lines, b.blankLine(Attrs{}, false))
	}

	if b.ybase+b.rows > len(b.lines) {
		b.ybase = len(b.lines) - b.rows
	}

	if b.ybase < 0 {
		b.ybase = 0
	}

	b.y = min(max(b.y, 0), b.rows-1)
	b.x = min(max(b.x, 0), b.cols)
}
