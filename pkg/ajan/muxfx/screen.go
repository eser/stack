// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"slices"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// ScreenUpdate is the payload of a screen message: what one pane shows.
//
// A full update (Full) replaces the frontend's copy of the pane: Lines holds
// every row, and History is a reset holding the most recent history lines.
// Otherwise Lines holds only the rows that changed since the previous screen
// message for the pane, and History, when present, the lines added to the
// history since then. A frontend applies History before Lines. Cols, Rows,
// the cursor, the title, the mouse protocol and the alternate screen flag
// are in every update.
//
// Styles is this message's style table: a run's Style is an index into it,
// and an absent Style is 0, which is always the default style. Links lists
// the hyperlinks the message's runs name, by the id in their Link field.
// The update's own MarshalJSON writes it (screen_wire.go).
type ScreenUpdate struct {
	Full      bool           `json:"full"`
	Cols      int            `json:"cols"`
	Rows      int            `json:"rows"`
	Cursor    ScreenCursor   `json:"cursor"`
	Title     string         `json:"title"`
	Mouse     string         `json:"mouse"`
	AltScreen bool           `json:"altScreen"`
	Styles    []ScreenStyle  `json:"styles"`
	Links     []ScreenLink   `json:"links,omitempty"`
	Lines     []ScreenLine   `json:"lines"`
	History   *ScreenHistory `json:"history,omitempty"`
}

// ScreenCursor is the cursor of a screen message. X is at most Cols-1, also
// while a character in the last column waits to wrap. Shape is "block",
// "underline" or "bar", and Blink whether it blinks; either is absent when
// the program left it to the frontend (DECSCUSR 0 or never set).
type ScreenCursor struct {
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Visible bool   `json:"visible"`
	Shape   string `json:"shape,omitempty"`
	Blink   *bool  `json:"blink,omitempty"`
}

// ScreenStyle is an entry of a screen message's style table: the colours and
// attributes of [vt.Attrs], with default values left out.
type ScreenStyle struct {
	Fg             vt.Color          `json:"fg,omitzero"`
	Bg             vt.Color          `json:"bg,omitzero"`
	UnderlineColor vt.Color          `json:"underlineColor,omitzero"`
	Flags          vt.Flags          `json:"flags,omitempty"`
	Underline      vt.UnderlineStyle `json:"underline,omitempty"`
}

// ScreenLink is a hyperlink a screen message's runs name (OSC 8). Link is
// the terminal's id for it, stable while the pane lives; ID is the
// program's id= parameter. URI is as the program sent it: check its scheme
// ([vt.IsSafeLinkURI]) before opening it.
type ScreenLink struct {
	Link uint32 `json:"link"`
	ID   string `json:"id,omitempty"`
	URI  string `json:"uri"`
}

// ScreenRun is a stretch of cells of one style, the message's form of
// [vt.Run]: Text is empty for blank cells, Style indexes the message's
// style table, Width is the width of each cell (0 for a leftover of a cut
// wide character, 2 for a wide one, whose spacer column Cells counts),
// Cluster says Text is one cell's grapheme cluster, and Link names an entry
// of the message's Links. On the wire it is an array,
// [text, style, cells, width, cluster, link], without the trailing elements
// that hold their defaults (screen_wire.go).
type ScreenRun struct {
	Text    string
	Style   int
	Width   int
	Cells   int
	Cluster bool
	Link    uint32
}

// ScreenLine is one screen row: its runs from column 0 (the columns after
// them are blank in the default style) and whether it continues the row
// above because the text wrapped. On the wire it is [row, runs], with a
// third element 1 when it wrapped.
type ScreenLine struct {
	Row     int
	Runs    []ScreenRun
	Wrapped bool
}

// ScreenHistory is the history part of a screen message. With Reset, Lines
// replaces the frontend's copy of the history; without it, Lines are
// appended to it. Lines are oldest first.
type ScreenHistory struct {
	Reset bool                `json:"reset,omitempty"`
	Lines []ScreenHistoryLine `json:"lines"`
}

// ScreenHistoryLine is one history line: its runs and whether it continues
// the line above. On the wire it is [runs], with a second element 1 when it
// wrapped.
type ScreenHistoryLine struct {
	Runs    []ScreenRun
	Wrapped bool
}

// mouseProtocolName is the mouse field of a screen message.
func mouseProtocolName(p vt.MouseProtocol) string {
	switch p {
	case vt.MouseX10:
		return "x10"
	case vt.MouseVT200:
		return "vt200"
	case vt.MouseDrag:
		return "drag"
	case vt.MouseAny:
		return "any"
	default:
		return "none"
	}
}

// screenMeta is the part of a screen message besides rows and history,
// kept to tell whether it changed.
type screenMeta struct {
	cursor vt.Cursor
	style  vt.CursorStyle
	title  string
	mouse  vt.MouseProtocol
	alt    bool
}

func metaOf(term *vt.Terminal) screenMeta {
	return screenMeta{
		cursor: term.Cursor(),
		style:  term.CursorStyle(),
		title:  term.Title(),
		mouse:  term.Modes().MouseProtocol,
		alt:    term.AltScreen(),
	}
}

func (m *screenMeta) wireCursor(cols int) ScreenCursor {
	out := ScreenCursor{
		X:       min(m.cursor.X, cols-1),
		Y:       m.cursor.Y,
		Visible: !m.cursor.Hidden,
	}

	if m.style.Shape != vt.CursorShapeDefault {
		out.Shape = m.style.Shape.String()
	}

	switch m.style.Blink {
	case vt.CursorBlinkOn:
		out.Blink = new(true)
	case vt.CursorBlinkOff:
		out.Blink = new(false)
	case vt.CursorBlinkDefault:
	}

	return out
}

// paneView is what a frontend was last sent of a pane: the rows, the
// history counters and the rest. A frame holds the rows that differ from
// it, so the view is the frontend's dirty-row state, bounded by the pane's
// size however much the program writes.
type paneView struct {
	sent    bool
	cols    int
	rows    int
	lines   [][]vt.Run
	wrapped []bool
	history vt.HistoryStamp
	meta    screenMeta
}

// frameBuilder turns runs into wire runs, filling the message's style table
// and link list.
type frameBuilder struct {
	term   *vt.Terminal
	styles []ScreenStyle
	ids    map[vt.Attrs]int
	links  []ScreenLink
	linked map[uint32]bool
}

func newFrameBuilder(term *vt.Terminal) *frameBuilder {
	// Style 0 is always the default, so a run without a style has it.
	return &frameBuilder{
		term:   term,
		styles: []ScreenStyle{{}},
		ids:    map[vt.Attrs]int{{}: 0},
		linked: map[uint32]bool{},
	}
}

func (b *frameBuilder) style(attrs vt.Attrs) int {
	if id, ok := b.ids[attrs]; ok {
		return id
	}

	id := len(b.styles)
	b.ids[attrs] = id
	b.styles = append(b.styles, ScreenStyle(attrs))

	return id
}

// link returns the id to send for a run's link: 0 when the terminal no
// longer knows it (its link table dropped it).
func (b *frameBuilder) link(linkID uint32) uint32 {
	if linkID == 0 {
		return 0
	}

	if known, seen := b.linked[linkID]; seen {
		if known {
			return linkID
		}

		return 0
	}

	l, ok := b.term.Link(linkID)
	b.linked[linkID] = ok

	if !ok {
		return 0
	}

	b.links = append(b.links, ScreenLink{Link: linkID, ID: l.ID, URI: l.URI})

	return linkID
}

func (b *frameBuilder) runs(runs []vt.Run) []ScreenRun {
	out := make([]ScreenRun, len(runs))

	for i, r := range runs {
		out[i] = ScreenRun{
			Text:    r.Text,
			Style:   b.style(r.Attrs),
			Width:   r.Width,
			Cells:   r.Cells,
			Cluster: r.Cluster,
			Link:    b.link(r.Link),
		}
	}

	return out
}

func (b *frameBuilder) history(lines []vt.HistoryLine) []ScreenHistoryLine {
	out := make([]ScreenHistoryLine, len(lines))

	for i, l := range lines {
		out[i] = ScreenHistoryLine{Runs: b.runs(l.Runs), Wrapped: l.Wrapped}
	}

	return out
}

// buildFrame builds the screen message that brings view up to the
// terminal's state and records it in view. full sends every row and resets
// the history to its last historyLimit lines; a size change or a first
// frame is always full. It reports false when nothing changed, and then
// nothing needs sending.
func buildFrame(term *vt.Terminal, view *paneView, full bool, historyLimit int) (ScreenUpdate, bool) {
	cols, rows := term.Cols(), term.Rows()

	if !view.sent || view.cols != cols || view.rows != rows {
		full = true
	}

	if full {
		view.cols, view.rows = cols, rows
		view.lines = make([][]vt.Run, rows)
		view.wrapped = make([]bool, rows)
	}

	b := newFrameBuilder(term)
	update := ScreenUpdate{Full: full, Cols: cols, Rows: rows, Lines: []ScreenLine{}}

	update.History = historyUpdate(term, view, full, historyLimit, b)

	for row := range rows {
		runs := term.LineRuns(row)
		wrapped := term.LineWrapped(row)

		if !full && wrapped == view.wrapped[row] && slices.Equal(runs, view.lines[row]) {
			continue
		}

		view.lines[row] = runs
		view.wrapped[row] = wrapped
		update.Lines = append(update.Lines, ScreenLine{Row: row, Runs: b.runs(runs), Wrapped: wrapped})
	}

	meta := metaOf(term)
	changed := full || len(update.Lines) > 0 || update.History != nil || meta != view.meta

	view.meta = meta
	view.sent = true

	update.Cursor = meta.wireCursor(cols)
	update.Title = meta.title
	update.Mouse = mouseProtocolName(meta.mouse)
	update.AltScreen = meta.alt
	update.Styles = b.styles
	update.Links = b.links

	return update, changed
}

// historyUpdate is the history part of a frame: a reset with the last
// historyLimit lines on a full frame, after a rewrite, or when lines the
// frontend has not seen already left the history; else the lines added
// since view's stamp, or nil when there are none.
func historyUpdate(term *vt.Terminal, view *paneView, full bool, historyLimit int, b *frameBuilder) *ScreenHistory {
	previous := view.history
	stamp := term.HistoryStamp()
	held := term.HistoryLen()
	added := stamp.Added - previous.Added
	view.history = stamp

	if full || stamp.Rewrites != previous.Rewrites || added > uint64(held) {
		n := min(held, max(historyLimit, 0))

		return &ScreenHistory{Reset: true, Lines: b.history(term.History(held-n, held))}
	}

	if added == 0 {
		return nil
	}

	return &ScreenHistory{Lines: b.history(term.History(held-int(added), held))}
}
