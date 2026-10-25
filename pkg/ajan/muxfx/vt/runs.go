// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

import "unicode/utf8"

// Run is a stretch of cells in a row that share their attributes, their
// hyperlink and their cell width. A row is a list of runs from column 0; the columns after the
// last run are empty cells with the default attributes.
//
// A run is one of three kinds:
//
//   - Blank: Text is "" and the run is Cells empty cells, each Width wide.
//     Width is 1, or 0 for a cell left over from a wide character whose left
//     half is gone; a frontend draws nothing there.
//   - Text: Cluster is false and every code point of Text is one cell of
//     Width columns (1 or 2).
//   - Cluster: Cluster is true and Text is the content of one cell of Width
//     columns: a base character with combining marks, a variation selector or
//     an emoji sequence.
//
// A cell of width 2 also covers the column to its right, which holds no
// content. Cells counts every column the run covers. A wide character that
// lost the column to its right (a narrowing resize cut it at the right edge)
// is a cluster run of its own with Cells 1.
//
// Link is the cells' OSC 8 hyperlink id, 0 for none ([Terminal.Link]).
type Run struct {
	Text    string `json:"text"`
	Attrs   Attrs  `json:"attrs"`
	Width   int    `json:"width"`
	Cells   int    `json:"cells"`
	Cluster bool   `json:"cluster,omitempty"`
	Link    uint32 `json:"link,omitempty"`
}

// packedRun is a [Run] as history stores it: its text is a slice of the
// line's text, ending at byte end.
type packedRun struct {
	attrs   Attrs
	end     uint32
	cells   uint32
	link    uint32
	width   uint8
	cluster bool
}

// packedRunSize is the size of a packedRun in memory (Attrs is 28 bytes,
// then 4 + 4 + 4 + 1 + 1 bytes, padded to 4), which the history's byte limit
// counts.
const packedRunSize = 44

func isDefaultBlank(c Cell) bool {
	return c.Content == "" && c.Width == 1 && c.Link == 0 && c.Attrs.IsDefault()
}

// isSpacerOf reports whether c is the right half of the wide character wide.
func isSpacerOf(c, wide Cell) bool {
	return c.Content == "" && c.Width == 0 && c.Attrs == wide.Attrs && c.Link == wide.Link
}

// runBuilder turns cells into packed runs, appending text to a scratch
// buffer that the caller copies once.
type runBuilder struct {
	text []byte
	runs []packedRun
	// lastStart is where the text of the last run starts.
	lastStart uint32
}

func (rb *runBuilder) reset() {
	rb.text = rb.text[:0]
	rb.runs = rb.runs[:0]
	rb.lastStart = 0
}

// add appends cells to the runs, dropping the empty default cells at the end.
func (rb *runBuilder) add(cells []Cell) {
	end := len(cells)
	for end > 0 && isDefaultBlank(cells[end-1]) {
		end--
	}

	for col := 0; col < end; {
		// The common cell, one byte of width 1, continuing a text run.
		if c := &cells[col]; len(c.Content) == 1 && c.Width == 1 && len(rb.runs) > 0 {
			prev := &rb.runs[len(rb.runs)-1]
			if prev.width == 1 && !prev.cluster && prev.end != rb.lastStart && prev.link == c.Link && prev.attrs == c.Attrs {
				rb.text = append(rb.text, c.Content[0])
				prev.end++
				prev.cells++
				col++

				continue
			}
		}

		col += rb.addCell(cells, col)
	}
}

func (rb *runBuilder) startRun(r packedRun) {
	rb.lastStart = uint32(len(rb.text))
	rb.runs = append(rb.runs, r)
}

// addCell appends the cell at col, with the spacer of a wide character, and
// returns how many columns it consumed.
func (rb *runBuilder) addCell(cells []Cell, col int) int {
	c := cells[col]
	width := min(max(c.Width, 0), 2)

	var prev *packedRun
	if len(rb.runs) > 0 {
		prev = &rb.runs[len(rb.runs)-1]
	}

	prevBlank := prev != nil && prev.end == rb.lastStart

	if c.Content == "" {
		if prevBlank && prev.attrs == c.Attrs && prev.link == c.Link && int(prev.width) == width {
			prev.cells++

			return 1
		}

		rb.startRun(packedRun{attrs: c.Attrs, end: uint32(len(rb.text)), cells: 1, link: c.Link, width: uint8(width)})

		return 1
	}

	consumed := 1
	whole := true

	if width == 2 {
		switch {
		case col+1 < len(cells) && isSpacerOf(cells[col+1], c):
			consumed = 2
		default:
			// No spacer: cut at the right edge, or the column to the right
			// holds something else and is kept as a cell of its own.
			whole = false
		}
	}

	single := whole && width > 0 && utf8.RuneCountInString(c.Content) == 1

	// A text run continues while every character in it is whole: one code
	// point per cell and, for a wide character, its spacer after it.
	if single && prev != nil && !prevBlank && !prev.cluster && prev.attrs == c.Attrs && prev.link == c.Link && int(prev.width) == width {
		rb.text = append(rb.text, c.Content...)
		prev.end = uint32(len(rb.text))
		prev.cells += uint32(consumed)

		return consumed
	}

	rb.startRun(packedRun{attrs: c.Attrs, cells: uint32(consumed), link: c.Link, width: uint8(width), cluster: !single})
	rb.text = append(rb.text, c.Content...)
	rb.runs[len(rb.runs)-1].end = uint32(len(rb.text))

	return consumed
}

// expandRuns writes the cells the runs describe into out and returns the
// number of columns written; cells past the end of out are dropped.
func expandRuns(text string, runs []packedRun, out []Cell) int {
	col := 0
	start := uint32(0)

	for _, r := range runs {
		col = writeRun(out, col, text[start:r.end], Cell{Width: int(r.width), Attrs: r.attrs, Link: r.link}, int(r.cells), r.cluster)
		start = r.end
	}

	return col
}

// writeRun writes one run's cells into out from col and returns the column
// after the run, or the end of out. like holds the run's width, attributes
// and link.
func writeRun(out []Cell, col int, text string, like Cell, cells int, cluster bool) int {
	limit := min(col+cells, len(out))

	switch {
	case text == "":
		for k := col; k < limit; k++ {
			out[k] = like
		}
	case cluster:
		putGrapheme(out, col, limit, text, like)
	default:
		for _, cp := range text {
			if col >= limit {
				break
			}

			col = putGrapheme(out, col, limit, string(cp), like)
		}
	}

	return limit
}

// putGrapheme writes one character cell and its spacer, up to limit, and
// returns the column after them.
func putGrapheme(out []Cell, col, limit int, content string, like Cell) int {
	if col >= limit {
		return col
	}

	out[col] = like
	out[col].Content = content
	col++

	spacer := like
	spacer.Width = 0

	for w := like.Width; w > 1 && col < limit; w-- {
		out[col] = spacer
		col++
	}

	return col
}

// runsCells is the number of columns runs cover.
func runsCells(runs []packedRun) int {
	n := 0
	for _, r := range runs {
		n += int(r.cells)
	}

	return n
}

// runsTrimmedLength is line.trimmedLength for packed runs: the column just
// past the last cell with content.
func runsTrimmedLength(text string, runs []packedRun) int {
	col := runsCells(runs)

	for i := len(runs) - 1; i >= 0; i-- {
		r := runs[i]
		col -= int(r.cells)

		start := uint32(0)
		if i > 0 {
			start = runs[i-1].end
		}

		s := text[start:r.end]
		if s == "" {
			continue
		}

		if r.cluster {
			return col + int(r.width)
		}

		return col + (utf8.RuneCountInString(s)-1)*int(r.width) + int(r.width)
	}

	return 0
}

// publicRuns converts packed runs to [Run] values.
func publicRuns(text string, runs []packedRun) []Run {
	out := make([]Run, len(runs))
	start := uint32(0)

	for i, r := range runs {
		out[i] = Run{
			Text:    text[start:r.end],
			Attrs:   r.attrs,
			Width:   int(r.width),
			Cells:   int(r.cells),
			Cluster: r.cluster,
			Link:    r.link,
		}
		start = r.end
	}

	return out
}

// LineRuns returns a row of the visible screen as runs (see [Run]); the
// empty default cells at its end are left out. Out-of-range rows return nil.
func (t *Terminal) LineRuns(row int) []Run {
	if row < 0 || row >= t.rows {
		return nil
	}

	var rb runBuilder
	rb.add(t.active.line(row).cells)

	return publicRuns(string(rb.text), rb.runs)
}

// RunCells expands runs into the cells of a row of cols columns, the
// inverse of the runs a [Terminal] reports. Columns past the runs are empty
// cells with the default attributes.
func RunCells(runs []Run, cols int) []Cell {
	cells := make([]Cell, max(cols, 0))

	col := 0
	for _, r := range runs {
		col = writeRun(cells, col, r.Text, Cell{Width: r.Width, Attrs: r.Attrs, Link: r.Link}, r.Cells, r.Cluster)
	}

	for ; col < len(cells); col++ {
		cells[col] = emptyCell(Attrs{})
	}

	return cells
}
