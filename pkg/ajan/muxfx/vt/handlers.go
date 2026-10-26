// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

import "unicode/utf8"

// The screen operations below follow xterm.js's InputHandler, edge cases
// included (the pending-wrap column, origin mode in relative moves, which
// attributes erased cells keep), so replayed output matches its snapshots.

// maxCellContent bounds the bytes one cell holds. A grapheme cluster has no
// length limit in Unicode (combining marks, emoji joined by zero width
// joiners); here the code points past the bound still join the cluster, and
// their width still counts, but are not stored, so one cell, and every REP of
// it, cannot grow without limit.
const maxCellContent = 256

// print writes a run of printable code points at the cursor, joining each
// into the grapheme cluster before it where UAX #29 says it continues it.
func (t *Terminal) print(data []rune) {
	b := t.active
	cols := t.cols
	row := b.line(b.y)
	startX := b.x
	// wrote is set once a cell is written or joined; checkedLeft once the
	// first new cell has cleared a wide character it cuts.
	wrote, checkedLeft := false, false

	for _, code := range data {
		if code < 127 && t.charsets.active != nil {
			if mapped, ok := t.charsets.active[code]; ok {
				code = mapped
			}
		}

		joined, oldWidth := false, 0

		if code >= 0x20 && code < 0x7f && t.join.last != gcbPrepend {
			// Printable ASCII joins only a prepended mark (GB9b): start a
			// cluster without the full segmentation.
			t.join = joinState{valid: true, width: 1, lastCP: code, lastWidth: 1}
		} else {
			p := propsOf(code)
			joined = t.join.joins(p)

			if !joined && startsNoCell(p) {
				t.keepZeroWidth(row, code)
				t.join = joinState{}

				continue
			}

			if joined {
				oldWidth = t.join.width
			}

			t.join = t.join.advance(code, p, joined)
		}

		width := t.join.width

		wrote = true

		if !checkedLeft && !joined {
			checkedLeft = true

			// Writing over the right half of a wide character clears its
			// left half.
			if b.x == startX && b.x > 0 && b.x-1 < cols && row.width(b.x-1) == 2 {
				row.cells[b.x-1] = t.printBlank()
			}
		}

		if b.x+width-oldWidth > cols {
			if !t.modes.Wraparound {
				b.x = cols - 1
				if width == 2 {
					continue
				}
			} else {
				row = t.wrapForPrint(row, oldWidth)
			}
		}

		if joined {
			t.joinCell(row, code, oldWidth, width)

			continue
		}

		if b.x >= cols {
			continue
		}

		if t.modes.Insert {
			row.insertCells(b.x, width, t.printBlank())

			if row.width(cols-1) == 2 {
				row.cells[cols-1] = t.printBlank()
			}
		}

		row.cells[b.x] = Cell{Content: codeString(code), Width: width, Attrs: t.cur, Link: t.link}
		b.x++

		for w := width; w > 1; w-- {
			row.cells[b.x] = Cell{Width: 0, Attrs: t.cur, Link: t.link}
			b.x++
		}
	}

	// Overwriting the left half of a wide character orphans its right half.
	if wrote && b.x < cols && row.width(b.x) == 0 && !row.cells[b.x].hasContent() {
		row.cells[b.x] = t.printBlank()
	}
}

// asciiChars holds every ASCII character, so the content of an ASCII cell
// is a slice of it and writing one allocates nothing.
const asciiChars = "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x20\x21\x22\x23\x24\x25\x26\x27\x28\x29\x2a\x2b\x2c\x2d\x2e\x2f\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x3a\x3b\x3c\x3d\x3e\x3f\x40\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a\x5b\x5c\x5d\x5e\x5f\x60\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a\x7b\x7c\x7d\x7e\x7f"

// codeString is a code point as a string.
func codeString(code rune) string {
	if code >= 0 && code < 0x80 {
		return asciiChars[code : code+1]
	}

	return string(code)
}

// printBlank is the empty cell print leaves where it clears one: the current
// attributes and link, as xterm.js writes them there (erasing keeps only the
// background).
func (t *Terminal) printBlank() Cell {
	return Cell{Width: 1, Attrs: t.cur, Link: t.link}
}

// joinCell adds a code point to the cluster in the cell before the cursor and
// gives the cell the cluster's new width: a wider cluster covers the next
// column, a narrower one (a text variation selector after an emoji) gives it
// back and the cursor moves back with it.
func (t *Terminal) joinCell(row *line, code rune, oldWidth, width int) {
	b := t.active

	offset := 2
	if b.x > 0 && row.width(b.x-1) != 0 {
		offset = 1
	}

	if b.x < offset {
		// No cell before the cursor holds the cluster.
		return
	}

	cell := &row.cells[b.x-offset]
	if len(cell.Content)+utf8.RuneLen(code) <= maxCellContent {
		cell.Content += string(code)
	}

	cell.Width = width

	for delta := width - oldWidth; delta > 0 && b.x < t.cols; delta-- {
		row.cells[b.x] = Cell{Width: 0, Attrs: t.cur, Link: t.link}
		b.x++
	}

	for delta := width - oldWidth; delta < 0 && b.x > 0; delta++ {
		b.x--
		row.cells[b.x] = Cell{Width: 1, Attrs: cell.Attrs, Link: cell.Link}
	}
}

// keepZeroWidth puts a zero-width code point that starts no cluster into the
// cell before the cursor, whose width it leaves alone, or drops it when that
// cell is empty: it takes no cell of its own.
func (t *Terminal) keepZeroWidth(row *line, code rune) {
	x := min(t.active.x, t.cols) - 1
	if x > 0 && row.width(x) == 0 && !row.cells[x].hasContent() {
		x--
	}

	if x < 0 || !row.cells[x].hasContent() {
		return
	}

	cell := &row.cells[x]
	if len(cell.Content)+utf8.RuneLen(code) <= maxCellContent {
		cell.Content += string(code)
	}
}

// wrapForPrint moves the cursor to the start of the next row for autowrap,
// scrolling at the bottom of the scroll region, and returns the new row.
//
// xterm.js scrolls first, then copies the cells that move down and clears the
// old row's tail. Here the tail is cleared before the scroll, after keeping
// the cells that move: on a one-row scroll region the old row leaves the
// screen in that scroll, into the history, and goes there cleared, as the
// row xterm.js keeps in its scrollback is.
func (t *Terminal) wrapForPrint(oldRow *line, oldWidth int) *line {
	b := t.active
	oldCol := b.x - oldWidth

	var moved line
	if oldWidth > 0 {
		moved.cells = make([]Cell, oldWidth)
		moved.copyCellsFrom(oldRow, oldCol, 0, oldWidth)
	}

	for col := oldCol; col < t.cols; col++ {
		if col >= 0 {
			oldRow.cells[col] = t.printBlank()
		}
	}

	b.x = oldWidth
	b.y++

	if b.y == b.scrollBottom+1 {
		b.y--
		b.scroll(t.cur.eraseAttrs(), true)
	} else {
		if b.y >= t.rows {
			b.y = t.rows - 1
		}

		b.line(b.y).wrapped = true
	}

	row := b.line(b.y)

	if oldWidth > 0 {
		// A combining character widened the last cell: move it down too.
		row.copyCellsFrom(&moved, 0, 0, oldWidth)
	}

	return row
}

func (t *Terminal) repeatPrecedingCharacter(n int) {
	if !t.join.valid {
		return
	}

	b := t.active
	x := b.x - t.join.width

	if x < 0 || x >= t.cols {
		return
	}

	cell := b.line(b.y).cells[x]

	text := []rune(cell.Content)
	if len(text) == 0 {
		return
	}

	n = boundRepeat(n, t.cols, t.rows, t.modes.Wraparound, cell.Width)

	data := make([]rune, 0, len(text)*n)
	for range n {
		data = append(data, text...)
	}

	t.print(data)
}

// boundRepeat caps a REP count so a program cannot make the terminal allocate
// or loop more than its screen holds. Past (rows+2)*cols copies every row the
// copies reach is full of the character, and each further row of copies
// leaves the same screen, so the count is reduced by whole rows: cols/width
// copies with autowrap, one without (the copies stay in the last column).
func boundRepeat(n, cols, rows int, wraparound bool, width int) int {
	limit := (rows + 2) * cols
	if n <= limit {
		return n
	}

	period := 1
	if wraparound {
		period = max(1, cols/max(width, 1))
	}

	return limit + (n-limit)%period
}

// restrictCursor clamps the cursor to the screen, or to the scroll region in
// origin mode. maxCol is cols-1, or cols where the pending-wrap column counts.
func (t *Terminal) restrictCursor(maxCol int) {
	b := t.active
	b.x = min(maxCol, max(0, b.x))

	if t.modes.Origin {
		b.y = min(b.scrollBottom, max(b.scrollTop, b.y))
	} else {
		b.y = min(t.rows-1, max(0, b.y))
	}
}

func (t *Terminal) setCursor(x, y int) {
	b := t.active

	b.x = x
	b.y = y

	if t.modes.Origin {
		b.y = b.scrollTop + y
	}

	t.restrictCursor(t.cols - 1)
}

// moveCursor moves relative to the cursor. In origin mode the target goes
// through setCursor, which adds the region top again; xterm.js does the same.
func (t *Terminal) moveCursor(dx, dy int) {
	t.restrictCursor(t.cols - 1)
	t.setCursor(t.active.x+dx, t.active.y+dy)
}

func (t *Terminal) cursorUp(n int) {
	b := t.active
	if diff := b.y - b.scrollTop; diff >= 0 {
		t.moveCursor(0, -min(diff, n))

		return
	}

	t.moveCursor(0, -n)
}

func (t *Terminal) cursorDown(n int) {
	b := t.active
	if diff := b.scrollBottom - b.y; diff >= 0 {
		t.moveCursor(0, min(diff, n))

		return
	}

	t.moveCursor(0, n)
}

func (t *Terminal) cursorForwardTab(n int) {
	b := t.active
	if b.x >= t.cols {
		return
	}

	// After cols stops the cursor is in the last column; more change nothing.
	for range min(n, t.cols) {
		b.x = b.nextStop(b.x)
	}
}

func (t *Terminal) cursorBackwardTab(n int) {
	b := t.active
	if b.x >= t.cols {
		return
	}

	for range min(n, t.cols) {
		b.x = b.prevStop(b.x)
	}
}

func (t *Terminal) tab() {
	b := t.active
	if b.x >= t.cols {
		return
	}

	b.x = b.nextStop(b.x)
}

func (t *Terminal) backspace() {
	b := t.active

	if !t.modes.ReverseWraparound {
		t.restrictCursor(t.cols - 1)

		if b.x > 0 {
			b.x--
		}

		return
	}

	t.restrictCursor(t.cols)

	if b.x > 0 {
		b.x--
	} else if b.y > b.scrollTop && b.y <= b.scrollBottom && b.line(b.y).wrapped {
		b.line(b.y).wrapped = false
		b.y--
		b.x = t.cols - 1

		l := b.line(b.y)
		if l.width(b.x) != 0 && !l.cells[b.x].hasContent() {
			b.x--
		}
	}

	t.restrictCursor(t.cols - 1)
}

func (t *Terminal) lineFeed() {
	b := t.active

	if t.lnm {
		b.x = 0
	}

	b.y++

	switch {
	case b.y == b.scrollBottom+1:
		b.y--
		b.scroll(t.cur.eraseAttrs(), false)
	case b.y >= t.rows:
		b.y = t.rows - 1
	default:
		b.line(b.y).wrapped = false
	}

	if b.x >= t.cols {
		b.x--
	}
}

func (t *Terminal) index() {
	b := t.active
	t.restrictCursor(t.cols - 1)

	b.y++

	switch {
	case b.y == b.scrollBottom+1:
		b.y--
		b.scroll(t.cur.eraseAttrs(), false)
	case b.y >= t.rows:
		b.y = t.rows - 1
	}

	t.restrictCursor(t.cols - 1)
}

func (t *Terminal) reverseIndex() {
	b := t.active
	t.restrictCursor(t.cols - 1)

	if b.y == b.scrollTop {
		b.deleteLine(b.ybase + b.scrollBottom)
		b.insertLine(b.ybase+b.y, b.blankLine(t.cur.eraseAttrs(), false))

		return
	}

	b.y--
	t.restrictCursor(t.cols - 1)
}

// eraseCell is what erased cells become: blank, keeping only the current
// background colour.
func (t *Terminal) eraseCell() Cell {
	return emptyCell(t.cur.eraseAttrs())
}

func (t *Terminal) eraseInLineRange(y, start, end int, clearWrap bool) {
	l := t.active.line(y)
	l.replaceCells(start, end, t.eraseCell())

	if clearWrap {
		l.wrapped = false
	}
}

func (t *Terminal) resetLine(y int) {
	l := t.active.line(y)
	l.fill(t.eraseCell())
	l.wrapped = false
}

func (t *Terminal) eraseInDisplay(mode int) {
	b := t.active
	t.restrictCursor(t.cols)

	switch mode {
	case 0:
		t.eraseInLineRange(b.y, b.x, t.cols, b.x == 0)

		for y := b.y + 1; y < t.rows; y++ {
			t.resetLine(y)
		}
	case 1:
		t.eraseInLineRange(b.y, 0, b.x+1, true)

		if b.x+1 >= t.cols && b.y+1 < t.rows {
			b.line(b.y + 1).wrapped = false
		}

		for y := b.y - 1; y >= 0; y-- {
			t.resetLine(y)
		}
	case 2:
		for y := t.rows - 1; y >= 0; y-- {
			t.resetLine(y)
		}
	case 3:
		b.clearHistory()
	}
}

func (t *Terminal) eraseInLine(mode int) {
	b := t.active
	t.restrictCursor(t.cols)

	switch mode {
	case 0:
		t.eraseInLineRange(b.y, b.x, t.cols, b.x == 0)
	case 1:
		t.eraseInLineRange(b.y, 0, b.x+1, false)
	case 2:
		t.eraseInLineRange(b.y, 0, t.cols, true)
	}
}

func (t *Terminal) eraseChars(n int) {
	b := t.active
	t.restrictCursor(t.cols - 1)
	b.line(b.y).replaceCells(b.x, b.x+n, t.eraseCell())
}

func (t *Terminal) insertChars(n int) {
	b := t.active
	t.restrictCursor(t.cols - 1)
	b.line(b.y).insertCells(b.x, n, t.eraseCell())
}

func (t *Terminal) deleteChars(n int) {
	b := t.active
	t.restrictCursor(t.cols - 1)
	b.line(b.y).deleteCells(b.x, n, t.eraseCell())
}

func (t *Terminal) insertLines(n int) {
	b := t.active
	t.restrictCursor(t.cols - 1)

	if b.y > b.scrollBottom || b.y < b.scrollTop {
		return
	}

	// More lines than the region holds below the cursor blank it all.
	for range min(n, b.scrollBottom-b.y+1) {
		b.deleteLine(b.ybase + b.scrollBottom)
		b.insertLine(b.ybase+b.y, b.blankLine(t.cur.eraseAttrs(), false))
	}

	b.x = 0
}

func (t *Terminal) deleteLines(n int) {
	b := t.active
	t.restrictCursor(t.cols - 1)

	if b.y > b.scrollBottom || b.y < b.scrollTop {
		return
	}

	for range min(n, b.scrollBottom-b.y+1) {
		b.deleteLine(b.ybase + b.y)
		b.insertLine(b.ybase+b.scrollBottom, b.blankLine(t.cur.eraseAttrs(), false))
	}

	b.x = 0
}

func (t *Terminal) scrollUp(n int) {
	b := t.active

	// Scrolling by more than the region holds blanks it all.
	for range min(n, b.scrollBottom-b.scrollTop+1) {
		b.deleteLine(b.ybase + b.scrollTop)
		b.insertLine(b.ybase+b.scrollBottom, b.blankLine(t.cur.eraseAttrs(), false))
	}
}

func (t *Terminal) scrollDown(n int) {
	b := t.active

	for range min(n, b.scrollBottom-b.scrollTop+1) {
		b.deleteLine(b.ybase + b.scrollBottom)
		b.insertLine(b.ybase+b.scrollTop, b.blankLine(Attrs{}, false))
	}
}

// shiftColumns inserts (right) or deletes (left) n columns at col in every
// row of the scroll region: SL, SR, DECIC and DECDC.
func (t *Terminal) shiftColumns(col, n int, right bool) {
	b := t.active
	if b.y > b.scrollBottom || b.y < b.scrollTop {
		return
	}

	for y := b.scrollTop; y <= b.scrollBottom; y++ {
		l := b.line(y)

		if right {
			l.insertCells(col, n, t.eraseCell())
		} else {
			l.deleteCells(col, n, t.eraseCell())
		}

		l.wrapped = false
	}
}
