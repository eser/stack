// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// ColorMode says how a [Color] value is read. The zero value is the
// terminal's default colour.
type ColorMode uint8

const (
	// ColorDefault is the terminal's default foreground or background.
	ColorDefault ColorMode = iota
	// ColorPalette16 is one of the 16 ANSI colours (SGR 30-37, 90-97 and the
	// background equivalents); Value is 0-15.
	ColorPalette16
	// ColorPalette256 is an xterm 256-colour index (SGR 38;5;n); Value is 0-255.
	ColorPalette256
	// ColorRGB is a 24-bit colour (SGR 38;2;r;g;b); Value is 0xRRGGBB.
	ColorRGB
)

// Color is a foreground or background colour of a cell.
type Color struct {
	Mode  ColorMode `json:"mode"`
	Value uint32    `json:"value"`
}

// Flags are the boolean text attributes of a cell.
type Flags uint16

const (
	// FlagBold is SGR 1.
	FlagBold Flags = 1 << iota
	// FlagDim is SGR 2.
	FlagDim
	// FlagItalic is SGR 3.
	FlagItalic
	// FlagUnderline is SGR 4 (any underline style) or SGR 21.
	FlagUnderline
	// FlagBlink is SGR 5.
	FlagBlink
	// FlagInverse is SGR 7.
	FlagInverse
	// FlagInvisible is SGR 8.
	FlagInvisible
	// FlagStrikethrough is SGR 9.
	FlagStrikethrough
	// FlagOverline is SGR 53.
	FlagOverline
)

// UnderlineStyle is the SGR 4:n underline variant. The zero value means no
// underline.
type UnderlineStyle uint8

const (
	// UnderlineNone means the cell is not underlined.
	UnderlineNone UnderlineStyle = iota
	// UnderlineSingle is SGR 4 or 4:1.
	UnderlineSingle
	// UnderlineDouble is SGR 21 or 4:2.
	UnderlineDouble
	// UnderlineCurly is SGR 4:3.
	UnderlineCurly
	// UnderlineDotted is SGR 4:4.
	UnderlineDotted
	// UnderlineDashed is SGR 4:5.
	UnderlineDashed
)

// Attrs are the colours and attributes a cell is drawn with.
//
// UnderlineColor is the SGR 58 colour. It is kept while the text is not
// underlined, so an SGR 24 followed by SGR 4 brings it back as in xterm.js,
// and it applies only while FlagUnderline is set; the default means the
// underline takes the foreground colour.
type Attrs struct {
	Fg             Color          `json:"fg"`
	Bg             Color          `json:"bg"`
	UnderlineColor Color          `json:"underlineColor"`
	Flags          Flags          `json:"flags"`
	Underline      UnderlineStyle `json:"underline"`
}

// IsDefault reports whether the attributes are the terminal defaults.
func (a Attrs) IsDefault() bool {
	return a == Attrs{}
}

// eraseAttrs are the attributes erased cells get: only the background colour
// of the current attributes survives, as in xterm.
func (a Attrs) eraseAttrs() Attrs {
	return Attrs{Bg: a.Bg}
}

// Cell is one grid position.
//
// Content is the grapheme cluster drawn in the cell (a base character with
// its combining marks, an emoji sequence, a flag), or "" for an empty cell.
// Width is 1 for a normal cell, 2 for the first half of a wide character and
// 0 for the cell that a wide character covers to its right. Link is the id of
// the OSC 8 hyperlink the cell was printed in, or 0; [Terminal.Link] gives
// its URI.
type Cell struct {
	Content string `json:"content"`
	Width   int    `json:"width"`
	Attrs   Attrs  `json:"attrs"`
	Link    uint32 `json:"link,omitempty"`
}

// Text returns the cell's content, or a space for an empty cell.
func (c Cell) Text() string {
	if c.Content == "" {
		return " "
	}

	return c.Content
}

func (c Cell) hasContent() bool {
	return c.Content != ""
}

// emptyCell is a blank width-1 cell with the given attributes.
func emptyCell(attrs Attrs) Cell {
	return Cell{Content: "", Width: 1, Attrs: attrs}
}

// line is one row of cells plus whether it continues the row above
// (soft-wrapped by autowrap rather than ended by a line feed).
//
// A history line is packed: cells is nil and text and runs hold its content
// as runs ([Run]), with cols its width. Only trimmedLength, resize and unpack
// work on a packed line; everything else needs the cells, so the code that
// reaches history lines (a resize) unpacks them first.
type line struct {
	cells   []Cell
	wrapped bool

	packed bool
	cols   int
	text   string
	runs   []packedRun
}

// lineSize is the memory of a packed line outside its text and runs, which
// the history's byte limit counts: the struct the history's ring holds (24
// bytes of cells, 8 of flags, 8 of cols, 16 of text and 24 of runs).
const lineSize = 80

// pack turns the line into its packed form, using rb as scratch space.
func (l *line) pack(rb *runBuilder) {
	if l.packed {
		return
	}

	rb.reset()
	rb.add(l.cells)

	l.cols = len(l.cells)
	l.text = string(rb.text)
	l.runs = nil

	if len(rb.runs) > 0 {
		l.runs = make([]packedRun, len(rb.runs))
		copy(l.runs, rb.runs)
	}

	l.cells = nil
	l.packed = true
}

// unpack turns a packed line back into cells.
func (l *line) unpack() {
	if !l.packed {
		return
	}

	cells := make([]Cell, l.cols)
	col := expandRuns(l.text, l.runs, cells)

	for ; col < len(cells); col++ {
		cells[col] = emptyCell(Attrs{})
	}

	l.cells = cells
	l.packed = false
	l.text = ""
	l.runs = nil
}

// packedBytes is the memory a packed line holds.
func (l *line) packedBytes() int {
	return lineSize + len(l.text) + cap(l.runs)*packedRunSize
}

func newLine(cols int, fill Cell, wrapped bool) *line {
	cells := make([]Cell, cols)
	for i := range cells {
		cells[i] = fill
	}

	return &line{cells: cells, wrapped: wrapped}
}

func (l *line) width(i int) int {
	return l.cells[i].Width
}

// trimmedLength is the column just past the last cell with content.
func (l *line) trimmedLength() int {
	if l.packed {
		return runsTrimmedLength(l.text, l.runs)
	}

	for i := len(l.cells) - 1; i >= 0; i-- {
		if l.cells[i].hasContent() {
			return i + l.cells[i].Width
		}
	}

	return 0
}

// trimmedText is the row as text without trailing empty cells. A wide
// character cut by a narrowing resize sits in the last column and counts two
// cells in trimmedLength, one past the row's end; the row still ends there.
func (l *line) trimmedText() string {
	end := min(l.trimmedLength(), len(l.cells))

	buf := make([]byte, 0, end)
	for col := 0; col < end; {
		c := l.cells[col]
		buf = append(buf, c.Text()...)

		col += max(c.Width, 1)
	}

	return string(buf)
}

func (l *line) fill(c Cell) {
	for i := range l.cells {
		l.cells[i] = c
	}
}

// insertCells shifts the cells from pos right by n, filling the gap.
func (l *line) insertCells(pos, n int, fill Cell) {
	length := len(l.cells)
	pos %= length

	if pos > 0 && l.width(pos-1) == 2 {
		l.cells[pos-1] = emptyCell(fill.Attrs)
	}

	if n < length-pos {
		copy(l.cells[pos+n:], l.cells[pos:length-n])

		for i := range n {
			l.cells[pos+i] = fill
		}
	} else {
		for i := pos; i < length; i++ {
			l.cells[i] = fill
		}
	}

	if l.width(length-1) == 2 {
		l.cells[length-1] = emptyCell(fill.Attrs)
	}
}

// deleteCells removes n cells at pos, shifting the rest left and filling the
// right end.
func (l *line) deleteCells(pos, n int, fill Cell) {
	length := len(l.cells)
	pos %= length

	if n < length-pos {
		copy(l.cells[pos:], l.cells[pos+n:])

		for i := length - n; i < length; i++ {
			l.cells[i] = fill
		}
	} else {
		for i := pos; i < length; i++ {
			l.cells[i] = fill
		}
	}

	if pos > 0 && l.width(pos-1) == 2 {
		l.cells[pos-1] = emptyCell(fill.Attrs)
	}

	if l.width(pos) == 0 && !l.cells[pos].hasContent() {
		l.cells[pos] = emptyCell(fill.Attrs)
	}
}

// replaceCells overwrites [start, end) with fill, clearing wide characters cut
// in half at either edge.
func (l *line) replaceCells(start, end int, fill Cell) {
	length := len(l.cells)

	if start > 0 && start <= length && l.width(start-1) == 2 {
		l.cells[start-1] = emptyCell(fill.Attrs)
	}

	if end < length && end > 0 && l.width(end-1) == 2 {
		l.cells[end] = emptyCell(fill.Attrs)
	}

	for ; start < end && start < length; start++ {
		l.cells[start] = fill
	}
}

// resize grows the row with fill cells or cuts it at cols.
func (l *line) resize(cols int, fill Cell) {
	if l.packed {
		// The columns past a packed line's runs are default empty cells, so
		// growing with those, or cutting only such cells, keeps it packed.
		if isDefaultBlank(fill) && cols >= runsCells(l.runs) {
			l.cols = cols

			return
		}

		l.unpack()
	}

	switch {
	case cols > len(l.cells):
		for len(l.cells) < cols {
			l.cells = append(l.cells, fill)
		}
	case cols < len(l.cells):
		l.cells = l.cells[:cols:cols]
	}
}

// copyCellsFrom copies length cells of src starting at srcCol to destCol.
// Overlapping copies within one row are handled.
//
// A reflow can ask for cells past the end of a row: a wide character cut by
// an earlier narrowing still counts two cells in the last column. xterm.js
// reads those as zeroed cells (no content, width 0) and drops writes past the
// end of the destination; so does this.
func (l *line) copyCellsFrom(src *line, srcCol, destCol, length int) {
	if length <= 0 {
		return
	}

	if srcCol >= 0 && destCol >= 0 && srcCol+length <= len(src.cells) && destCol+length <= len(l.cells) {
		copy(l.cells[destCol:destCol+length], src.cells[srcCol:srcCol+length])

		return
	}

	cells := make([]Cell, length)
	for i := range cells {
		if k := srcCol + i; k >= 0 && k < len(src.cells) {
			cells[i] = src.cells[k]
		}
	}

	for i, c := range cells {
		if k := destCol + i; k >= 0 && k < len(l.cells) {
			l.cells[k] = c
		}
	}
}
