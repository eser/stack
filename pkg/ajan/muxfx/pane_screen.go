// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"strconv"
	"strings"
	"unicode"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// paneScreen is a frontend's copy of one pane's screen, rebuilt from the
// server's screen messages, and the rows the next frame redraws.
//
// Rows are kept as runs, which is what the messages carry and what costs
// memory in proportion to the content; a frame expands only the rows it
// draws into cells.
type paneScreen struct {
	cols   int
	rows   int
	lines  [][]vt.Run
	cursor ScreenCursor
	dirty  []bool
	// all redraws every row on the next frame.
	all bool
	// seen orders the screens by last use, to drop the stalest first.
	seen uint64
}

func newPaneScreen() *paneScreen {
	return &paneScreen{all: true}
}

// apply brings the screen up to a screen message. The message comes from a
// server that may be remote, so sizes are bounded by
// [MaxRemoteViewportCols] by [MaxRemoteViewportRows], rows and styles out of
// range are ignored, run lengths are clamped, and control characters in
// the text are replaced, so nothing in it reaches the host terminal as a
// sequence. Decoding the message's wire form already rejected runs and
// lines of the wrong shape ([ScreenRun.UnmarshalJSON]); the bounds here
// hold for a message built in Go too. History is not kept: the TUI has no
// scrollback of its own (the scroll mode scrolls the program).
func (p *paneScreen) apply(u *ScreenUpdate) {
	cols := min(max(u.Cols, 0), MaxRemoteViewportCols)
	rows := min(max(u.Rows, 0), MaxRemoteViewportRows)

	if u.Full || cols != p.cols || rows != p.rows {
		p.cols, p.rows = cols, rows
		p.lines = make([][]vt.Run, rows)
		p.dirty = make([]bool, rows)
		p.all = true
	}

	for i := range u.Lines {
		line := &u.Lines[i]
		if line.Row < 0 || line.Row >= rows {
			continue
		}

		p.lines[line.Row] = wireRuns(line.Runs, u.Styles)
		p.dirty[line.Row] = true
	}

	// The cursor is drawn as an inverse cell: when it moves, appears or
	// hides, redraw the row it leaves and the one it enters.
	if u.Cursor.X != p.cursor.X || u.Cursor.Y != p.cursor.Y || u.Cursor.Visible != p.cursor.Visible {
		p.markRow(p.cursor.Y)
		p.markRow(u.Cursor.Y)
	}

	p.cursor = u.Cursor
}

func (p *paneScreen) markRow(row int) {
	if row >= 0 && row < len(p.dirty) {
		p.dirty[row] = true
	}
}

// wireRuns turns the runs of a screen message back into [vt.Run] values,
// with the attributes from the message's style table.
func wireRuns(runs []ScreenRun, styles []ScreenStyle) []vt.Run {
	if len(runs) == 0 {
		return nil
	}

	out := make([]vt.Run, len(runs))

	for i, r := range runs {
		var attrs vt.Attrs
		if r.Style > 0 && r.Style < len(styles) {
			attrs = vt.Attrs(styles[r.Style])
		}

		width := min(max(r.Width, 0), 2)
		if r.Text != "" {
			width = max(width, 1)
		}

		out[i] = vt.Run{
			Text:    printableText(r.Text),
			Attrs:   attrs,
			Width:   width,
			Cells:   min(max(r.Cells, 0), MaxRemoteViewportCols),
			Cluster: r.Cluster,
			Link:    r.Link,
		}
	}

	return out
}

// printableText replaces control characters with spaces, one for one, so
// the text keeps its length in characters and so its cells.
func printableText(s string) string {
	if strings.IndexFunc(s, unicode.IsControl) < 0 {
		return s
	}

	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}

		return r
	}, s)
}

// paneRect is where a pane's content goes on the host screen: 1-based row
// and column of its top left cell, and its size in cells.
type paneRect struct {
	row    int
	col    int
	width  int
	height int
}

// render draws the rows that changed since the previous frame, or every row
// with full, into rect, and the cursor as an inverse cell when the program
// shows it. Rows and columns outside rect are cut.
func (p *paneScreen) render(out *strings.Builder, rect paneRect, full bool) {
	rows := min(rect.height, p.rows)
	cols := min(rect.width, p.cols)

	for r := range rows {
		if !full && !p.all && !p.dirty[r] {
			continue
		}

		out.WriteString(moveTo(rect.row+r, rect.col))

		cursorCol := -1
		if p.cursor.Visible && p.cursor.Y == r {
			cursorCol = p.cursor.X
		}

		renderCells(out, vt.RunCells(p.lines[r], cols), cursorCol)
	}

	clear(p.dirty)
	p.all = false
}

// renderCells writes a row of cells with their foreground and text
// attributes, and the cell at cursorCol (-1 for none) inverse. A wide
// character is written once and its covered cell skipped; one cut by the
// right edge is drawn as a space.
func renderCells(out *strings.Builder, cells []vt.Cell, cursorCol int) {
	current := ""

	setStyle := func(sgr string) {
		if sgr == current {
			return
		}

		if current != "" {
			out.WriteString("\x1b[0m")
		}

		out.WriteString(sgr)
		current = sgr
	}

	for col, cell := range cells {
		if cell.Width == 0 && cell.Content == "" {
			// The right half of a wide character already drawn, or the
			// leftover of one that lost its left half.
			continue
		}

		ch := cell.Text()
		if cell.Width == 2 && col+1 >= len(cells) {
			ch = " "
		}

		if col == cursorCol {
			setStyle("")
			out.WriteString("\x1b[7m" + ch + "\x1b[27m")

			continue
		}

		setStyle(sgrFor(cell.Attrs))
		out.WriteString(ch)
	}

	setStyle("")
}

// sgrFor builds the SGR sequence for a cell's foreground and text
// attributes. Backgrounds and inverse are left out on purpose so the host
// terminal's background shows through.
func sgrFor(attrs vt.Attrs) string {
	codes := make([]string, 0, 6)

	if attrs.Flags&vt.FlagBold != 0 {
		codes = append(codes, "1")
	}

	if attrs.Flags&vt.FlagDim != 0 {
		codes = append(codes, "2")
	}

	if attrs.Flags&vt.FlagItalic != 0 {
		codes = append(codes, "3")
	}

	if attrs.Flags&vt.FlagUnderline != 0 {
		codes = append(codes, "4")
	}

	fg := attrs.Fg

	switch fg.Mode {
	case vt.ColorPalette16:
		if fg.Value < 8 {
			codes = append(codes, strconv.Itoa(30+int(fg.Value)))
		} else {
			codes = append(codes, strconv.Itoa(90+int(fg.Value)-8))
		}
	case vt.ColorPalette256:
		codes = append(codes, "38", "5", strconv.Itoa(int(fg.Value)))
	case vt.ColorRGB:
		codes = append(codes, "38", "2",
			strconv.Itoa(int(fg.Value>>16&0xff)),
			strconv.Itoa(int(fg.Value>>8&0xff)),
			strconv.Itoa(int(fg.Value&0xff)))
	case vt.ColorDefault:
	}

	if len(codes) == 0 {
		return ""
	}

	return "\x1b[" + strings.Join(codes, ";") + "m"
}
