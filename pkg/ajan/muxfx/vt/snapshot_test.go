// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// The fixtures were recorded by feeding the same byte streams to
// @xterm/headless 6.0.0 configured as the TypeScript VTerminal configured it
// (scrollback 0), or with the scrollback a case names; those snapshots hold
// the history too. vt_snapshots.json holds the synthetic cases, one feature
// each; vt_corpus.json.gz holds the output of real programs (Claude Code,
// vim, less, top, git's pager, sh and zsh) recorded on a pseudo-terminal at
// two or more sizes, with resizes, each at scrollback 0 and at 200 lines. The
// muxfx README says how they were recorded.

type snapshotFile struct {
	Source string         `json:"source"`
	Cases  []snapshotCase `json:"cases"`
}

type snapshotCase struct {
	Name string `json:"name"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
	// Scrollback is the xterm.js scrollback the case was recorded with; the
	// replay gives vt the same history limit. Absent means 0.
	Scrollback int            `json:"scrollback"`
	Steps      []snapshotStep `json:"steps"`
}

type snapshotStep struct {
	Write       *string   `json:"write"`
	WriteBase64 *string   `json:"writeBase64"`
	Resize      []int     `json:"resize"`
	Expect      *snapshot `json:"expect"`
}

type snapshot struct {
	Cursor       struct{ X, Y int } `json:"cursor"`
	CursorHidden bool               `json:"cursorHidden"`
	CursorStyle  string             `json:"cursorStyle"`
	Alt          bool               `json:"alt"`
	Lines        []string           `json:"lines"`
	Widths       [][3]int           `json:"widths"`
	Wrapped      []int              `json:"wrapped"`
	Styles       []styleRun         `json:"styles"`
	Modes        []string           `json:"modes"`
	Title        string             `json:"title"`

	// History holds the lines above the screen, read like the screen, when
	// the case has scrollback.
	History *rowsSnapshot `json:"history"`

	// StaleRows marks a screen recorded after xterm.js read rows past the end
	// of its row list, or started its viewport there, so it works with and
	// shows rows its ring buffer still holds; see knownDivergences.
	StaleRows bool `json:"staleRows"`
}

// rowsSnapshot is a list of rows read cell by cell, as the screen is.
type rowsSnapshot struct {
	Lines   []string   `json:"lines"`
	Widths  [][3]int   `json:"widths"`
	Wrapped []int      `json:"wrapped"`
	Styles  []styleRun `json:"styles"`
}

type styleRun struct {
	Row   int    `json:"row"`
	Col   int    `json:"col"`
	Len   int    `json:"len"`
	Style string `json:"style"`
}

// divergence is a place where this model deliberately differs from
// @xterm/headless: a whole case, or only the listed steps of it (the steps
// after them are still compared).
type divergence struct {
	steps  []int
	reason string
}

func (d divergence) covers(step int) bool {
	return d.steps == nil || slices.Contains(d.steps, step)
}

// knownDivergences lists every difference from the reference in the
// fixtures, keyed by case name, each with its reason: a defect of xterm.js
// 6.0.0 that vt does not copy, or a place where the unicode-graphemes addon
// does not follow Unicode 15.1. TestKnownDivergences checks what vt does
// instead, against hand-checked screens. The corpus of real programs has none
// of them.
func knownDivergences() map[string]divergence {
	return map[string]divergence{
		// With scrollback 0, a narrowing reflow can leave xterm.js's viewport
		// starting past the rows it keeps, and it then shows the top row again
		// at the bottom (its circular row list wraps around). Without history
		// vt drops the row pushed off the top instead
		// (TestNarrowingReflowDropsTheTopRow); with history the row goes into
		// it, and there xterm.js agrees: resize-reflow-wide-chars-scrollback
		// records the same stream at scrollback 10 and matches. The recorder
		// flags every snapshot that read past the row list (staleRows), and
		// the replay fails on a flagged case that is not listed here.
		"resize-reflow-wide-chars": {reason: "xterm.js at scrollback 0 shows a wrapped-around row after a narrowing reflow near the bottom"},
		// ED 1 with the cursor in the last column clears the wrapped flag of
		// the row below the cursor. xterm.js indexes that row from the top of
		// its scrollback instead of the screen (lines.get(y + 1) without
		// ybase), so with history it unwraps a history line, and on the
		// bottom row at scrollback 0 it throws. vt unwraps the screen row
		// below the cursor.
		"ed1-unwraps-a-history-line": {reason: "xterm.js's ED 1 unwraps a row counted from the top of its scrollback"},
		// A zero-width character that starts no cluster (after a control
		// sequence) takes no cell in vt: it goes into the cell before the
		// cursor, or is dropped when there is none. The unicode-graphemes
		// addon gives it a cell one column wide, so here a zero width space
		// in the pending-wrap column wraps and takes the next row's first
		// cells, and a lone combining mark at the start of a row takes a cell.
		"zero-width-in-pending-wrap":       {reason: "the addon gives a lone zero width space a cell"},
		"rep-after-resize-lone-combining":  {reason: "the addon gives a lone combining mark a cell"},
		"unicode-zero-width-takes-no-cell": {reason: "the addon gives zero width spaces, marks and a lone combining mark cells"},
		// Unicode 15.1 rules the unicode-graphemes addon 0.4.0 does not
		// follow. A text variation selector (VS15) after a character with
		// emoji variation sequences asks for its text form, one column; the
		// addon keeps two.
		"unicode-text-selector-narrows": {reason: "the addon ignores VS15"},
		// VS16 widens only a character that has emoji variation sequences;
		// the addon widens any character before it.
		"unicode-emoji-selector-needs-a-base": {reason: "the addon widens any character before VS16"},
		// GB11 joins a pictograph after a zero width joiner only when a
		// pictograph (and extenders) came before the joiner; the addon joins
		// after any joiner.
		"unicode-zwj-needs-a-pictograph": {reason: "the addon joins any character after a zero width joiner"},
		// GB9c, new in 15.1, keeps an Indic conjunct (consonant, virama,
		// consonant) in one cluster; the addon breaks before the second
		// consonant.
		"unicode-indic-conjunct": {reason: "the addon lacks the 15.1 Indic conjunct rule GB9c"},
		// A regional indicator has Emoji_Presentation, so one without a pair
		// is two columns wide; the addon makes it one.
		"unicode-lone-regional-indicator": {reason: "the addon gives a lone regional indicator one column"},
		// DECRC copies the saved background word in xterm.js, whose
		// extended-attributes bit decides whether printed cells get the
		// link, so text after a restore loses the open link until an SGR
		// that sets the bit again. A link is not part of the saved cursor in
		// vt, and it stays.
		"osc8-survives-cursor-restore": {reason: "xterm.js drops the open link from text after DECRC"},
		// OSC 8 with parameters and an empty URI (OSC 8 ; id=x ; ST) ends the
		// link in vt, as the hyperlink specification's empty URI says;
		// xterm.js ignores that form and keeps the link open.
		"osc8-close-with-params": {reason: "xterm.js ignores a closing OSC 8 that carries parameters"},
		// vt stores URIs of up to 2048 bytes (maxLinkURI) and ends the link
		// at a longer one; xterm.js stores any URI its 10 MB OSC limit lets
		// through.
		"osc8-uri-too-long": {reason: "vt bounds link URIs at 2048 bytes"},
		// SGR 59 stores -1 into xterm.js's 26-bit underline colour field,
		// which reads back as RGB #ffffff. vt resets the underline to the
		// foreground colour, as SGR 59 means.
		"sgr-59-white-underline": {reason: "xterm.js turns SGR 59 into a white underline"},
		// DECALN fills with the current colours and flags but fresh extended
		// attributes, so an underlined fill reports underline style 0 in
		// xterm.js. vt fills with the current attributes, underline style
		// included.
		"decaln-drops-underline-style": {reason: "xterm.js's DECALN loses the underline style"},
		// RIS resets DECTCEM in xterm and VT terminals; xterm.js leaves the
		// cursor hidden. vt shows it.
		"ris-keeps-cursor-hidden": {reason: "xterm.js keeps the cursor hidden across RIS"},
		// On a one-row screen xterm.js's autowrap scroll recycles the row
		// being wrapped as the new row and then clears the old row's tail in
		// it with the current colours. vt clears the old row, which leaves
		// the screen.
		"one-row-autowrap-recycles-row": {reason: "xterm.js clears the wrapped row's tail in the new row on a one-row screen"},
		// xterm.js's reflow moves every combined character (a base with
		// combining marks or a variation selector) at or after the copied
		// range, not only the copied cells, so one overwrites another. vt
		// moves the cells it copies.
		"reflow-moves-combined-chars": {reason: "xterm.js's reflow moves combined characters it did not copy"},
	}
}

func readFixture(name string) ([]byte, error) {
	path := filepath.Join("..", "testdata", name+".json")

	data, err := os.ReadFile(path) //nolint:gosec // G304: the test's own fixture
	if !errors.Is(err, os.ErrNotExist) {
		return data, err //nolint:wrapcheck
	}

	compressed, err := os.ReadFile(path + ".gz") //nolint:gosec // G304: the test's own fixture
	if err != nil {
		return nil, err //nolint:wrapcheck
	}

	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, err //nolint:wrapcheck
	}

	return io.ReadAll(reader) //nolint:wrapcheck
}

func loadSnapshots(t *testing.T, name string) snapshotFile {
	t.Helper()

	raw, err := readFixture(name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}

	var f snapshotFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parse fixture %s: %v", name, err)
	}

	if len(f.Cases) == 0 {
		t.Fatalf("fixture %s has no cases", name)
	}

	return f
}

func fixtureNames() []string {
	return []string{"vt_snapshots", "vt_corpus"}
}

func colorKey(c vt.Color) string {
	switch c.Mode {
	case vt.ColorPalette16:
		return fmt.Sprintf("16:%d", c.Value)
	case vt.ColorPalette256:
		return fmt.Sprintf("256:%d", c.Value)
	case vt.ColorRGB:
		return fmt.Sprintf("rgb:%06x", c.Value)
	case vt.ColorDefault:
		return ""
	default:
		return fmt.Sprintf("?%d:%d", c.Mode, c.Value)
	}
}

// styleKey mirrors styleKey in the recorder script; term resolves a cell's
// OSC 8 link.
func styleKey(term *vt.Terminal, c vt.Cell) string {
	parts := make([]string, 0, 12)

	if fg := colorKey(c.Attrs.Fg); fg != "" {
		parts = append(parts, "fg="+fg)
	}

	if bg := colorKey(c.Attrs.Bg); bg != "" {
		parts = append(parts, "bg="+bg)
	}

	flags := []struct {
		flag vt.Flags
		name string
	}{
		{vt.FlagBold, "bold"},
		{vt.FlagDim, "dim"},
		{vt.FlagItalic, "italic"},
		{vt.FlagUnderline, "underline"},
		{vt.FlagBlink, "blink"},
		{vt.FlagInverse, "inverse"},
		{vt.FlagInvisible, "invisible"},
		{vt.FlagStrikethrough, "strikethrough"},
		{vt.FlagOverline, "overline"},
	}

	for _, f := range flags {
		if c.Attrs.Flags&f.flag != 0 {
			parts = append(parts, f.name)
		}
	}

	if c.Attrs.Flags&vt.FlagUnderline != 0 && c.Attrs.Underline != vt.UnderlineSingle {
		parts = append(parts, fmt.Sprintf("underline-style=%d", c.Attrs.Underline))
	}

	if ul := colorKey(c.Attrs.UnderlineColor); ul != "" && c.Attrs.Flags&vt.FlagUnderline != 0 {
		parts = append(parts, "underline-color="+ul)
	}

	if c.Link != 0 {
		link, ok := term.Link(c.Link)
		if !ok {
			link.URI = "?"
		}

		parts = append(parts, "link="+link.ID+";"+link.URI)
	}

	return strings.Join(parts, " ")
}

// cursorStyleName mirrors cursorStyleOf in the recorder script.
func cursorStyleName(style vt.CursorStyle) string {
	if style == (vt.CursorStyle{}) {
		return ""
	}

	blink := "default"

	switch style.Blink {
	case vt.CursorBlinkOn:
		blink = "blink"
	case vt.CursorBlinkOff:
		blink = "steady"
	case vt.CursorBlinkDefault:
	}

	return style.Shape.String() + " " + blink
}

// modeNames mirrors modesOf in the recorder script.
func modeNames(m vt.Modes) []string {
	names := []string{}

	add := func(on bool, name string) {
		if on {
			names = append(names, name)
		}
	}

	add(m.ApplicationCursorKeys, "applicationCursorKeys")
	add(m.ApplicationKeypad, "applicationKeypad")
	add(m.BracketedPaste, "bracketedPaste")
	add(m.Insert, "insert")
	add(m.Origin, "origin")
	add(m.ReverseWraparound, "reverseWraparound")
	add(m.SendFocus, "sendFocus")
	add(m.SynchronizedOutput, "synchronizedOutput")
	add(!m.Wraparound, "noWraparound")

	switch m.MouseProtocol {
	case vt.MouseX10:
		names = append(names, "mouse=x10")
	case vt.MouseVT200:
		names = append(names, "mouse=vt200")
	case vt.MouseDrag:
		names = append(names, "mouse=drag")
	case vt.MouseAny:
		names = append(names, "mouse=any")
	case vt.MouseNone:
	}

	switch m.MouseEncoding {
	case vt.MouseEncodingSGR:
		names = append(names, "mouseEncoding=SGR")
	case vt.MouseEncodingSGRPixels:
		names = append(names, "mouseEncoding=SGR_PIXELS")
	case vt.MouseEncodingDefault:
	}

	slices.Sort(names)

	return names
}

// readRows reads rows cell by cell, as the recorder does.
func readRows(term *vt.Terminal, rows int, cell func(row, col int) vt.Cell, wrapped func(row int) bool) rowsSnapshot {
	cols := term.Cols()

	s := rowsSnapshot{
		Lines:   make([]string, 0, rows),
		Widths:  [][3]int{},
		Wrapped: []int{},
		Styles:  []styleRun{},
	}

	for row := range rows {
		var text strings.Builder

		var run *styleRun

		for col := range cols {
			c := cell(row, col)
			if c.Width != 1 {
				s.Widths = append(s.Widths, [3]int{row, col, c.Width})
			}

			if c.Width != 0 {
				text.WriteString(c.Text())
			}

			key := styleKey(term, c)
			if run != nil && run.Style == key {
				run.Len++

				continue
			}

			if run != nil && run.Style != "" {
				s.Styles = append(s.Styles, *run)
			}

			run = &styleRun{Row: row, Col: col, Len: 1, Style: key}
		}

		if run != nil && run.Style != "" {
			s.Styles = append(s.Styles, *run)
		}

		s.Lines = append(s.Lines, text.String())

		if wrapped(row) {
			s.Wrapped = append(s.Wrapped, row)
		}
	}

	return s
}

// historyRows reads the terminal's history through its public API: the runs
// of each line, expanded to cells.
func historyRows(term *vt.Terminal) *rowsSnapshot {
	lines := term.History(0, term.HistoryLen())
	if len(lines) == 0 {
		return nil
	}

	cells := make([][]vt.Cell, len(lines))
	for i, l := range lines {
		cells[i] = vt.RunCells(l.Runs, term.Cols())
	}

	rows := readRows(term, len(lines),
		func(row, col int) vt.Cell { return cells[row][col] },
		func(row int) bool { return lines[row].Wrapped })

	return &rows
}

func takeSnapshot(term *vt.Terminal) *snapshot {
	s := &snapshot{}

	cur := term.Cursor()
	s.Cursor.X = cur.X
	s.Cursor.Y = cur.Y
	s.CursorHidden = cur.Hidden
	s.CursorStyle = cursorStyleName(term.CursorStyle())
	s.Alt = term.AltScreen()
	s.Modes = modeNames(term.Modes())
	s.Title = term.Title()

	rows := readRows(term, term.Rows(), term.Cell, term.LineWrapped)
	s.Lines = rows.Lines
	s.Widths = rows.Widths
	s.Wrapped = rows.Wrapped
	s.Styles = rows.Styles
	s.History = historyRows(term)

	return s
}

// orEmpty turns a field the recorder left out into the empty value a
// snapshot of this model has.
func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}

	return s
}

func diffRows(what string, want, got *rowsSnapshot) []string {
	var problems []string

	for i := range max(len(want.Lines), len(got.Lines)) {
		var w, g string
		if i < len(want.Lines) {
			w = want.Lines[i]
		}

		if i < len(got.Lines) {
			g = got.Lines[i]
		}

		if w != g {
			problems = append(problems, fmt.Sprintf("%s row %d = %q, want %q", what, i, g, w))
		}
	}

	if len(want.Lines) != len(got.Lines) {
		problems = append(problems, fmt.Sprintf("%s has %d rows, want %d", what, len(got.Lines), len(want.Lines)))
	}

	if w := orEmpty(want.Widths); !slices.Equal(w, orEmpty(got.Widths)) {
		problems = append(problems, fmt.Sprintf("%s cells with width != 1 = %v, want %v", what, got.Widths, w))
	}

	if w := orEmpty(want.Wrapped); !slices.Equal(w, orEmpty(got.Wrapped)) {
		problems = append(problems, fmt.Sprintf("%s wrapped rows = %v, want %v", what, got.Wrapped, w))
	}

	if w := orEmpty(want.Styles); !slices.Equal(w, orEmpty(got.Styles)) {
		problems = append(problems, what+" "+styleDiff(w, orEmpty(got.Styles)))
	}

	return problems
}

func diffSnapshots(want, got *snapshot) []string {
	var problems []string

	if want.History != nil || got.History != nil {
		var w, g rowsSnapshot
		if want.History != nil {
			w = *want.History
		}

		if got.History != nil {
			g = *got.History
		}

		problems = append(problems, diffRows("history", &w, &g)...)
	}

	if want.Cursor != got.Cursor {
		problems = append(problems, fmt.Sprintf("cursor = %d,%d, want %d,%d", got.Cursor.X, got.Cursor.Y, want.Cursor.X, want.Cursor.Y))
	}

	if want.CursorHidden != got.CursorHidden {
		problems = append(problems, fmt.Sprintf("cursor hidden = %v, want %v", got.CursorHidden, want.CursorHidden))
	}

	if want.CursorStyle != got.CursorStyle {
		problems = append(problems, fmt.Sprintf("cursor style = %q, want %q", got.CursorStyle, want.CursorStyle))
	}

	if want.Alt != got.Alt {
		problems = append(problems, fmt.Sprintf("alt screen = %v, want %v", got.Alt, want.Alt))
	}

	for i := range max(len(want.Lines), len(got.Lines)) {
		var w, g string
		if i < len(want.Lines) {
			w = want.Lines[i]
		}

		if i < len(got.Lines) {
			g = got.Lines[i]
		}

		if w != g {
			problems = append(problems, fmt.Sprintf("row %d = %q, want %q", i, g, w))
		}
	}

	if w := orEmpty(want.Widths); !slices.Equal(w, got.Widths) {
		problems = append(problems, fmt.Sprintf("cells with width != 1 = %v, want %v", got.Widths, w))
	}

	if w := orEmpty(want.Wrapped); !slices.Equal(w, got.Wrapped) {
		problems = append(problems, fmt.Sprintf("wrapped rows = %v, want %v", got.Wrapped, w))
	}

	if w := orEmpty(want.Styles); !slices.Equal(w, got.Styles) {
		problems = append(problems, styleDiff(w, got.Styles))
	}

	if w := orEmpty(want.Modes); !slices.Equal(w, got.Modes) {
		problems = append(problems, fmt.Sprintf("modes = %v, want %v", got.Modes, w))
	}

	if want.Title != got.Title {
		problems = append(problems, fmt.Sprintf("title = %q, want %q", got.Title, want.Title))
	}

	return problems
}

// styleDiff names the first style run that differs, which is readable where
// a dump of every run on a full screen is not.
func styleDiff(want, got []styleRun) string {
	for i := range min(len(want), len(got)) {
		if want[i] != got[i] {
			return fmt.Sprintf("style run %d = %+v, want %+v (%d runs, want %d)", i, got[i], want[i], len(got), len(want))
		}
	}

	return fmt.Sprintf("%d style runs, want %d", len(got), len(want))
}

func stepBytes(t *testing.T, step snapshotStep) []byte {
	t.Helper()

	switch {
	case step.WriteBase64 != nil:
		data, err := base64.StdEncoding.DecodeString(*step.WriteBase64)
		if err != nil {
			t.Fatalf("decode step: %v", err)
		}

		return data
	case step.Write != nil:
		return []byte(*step.Write)
	default:
		return nil
	}
}

// replay runs every case of every fixture; write feeds one step's bytes.
func replay(t *testing.T, write func(term *vt.Terminal, data []byte)) {
	t.Helper()

	for _, name := range fixtureNames() {
		fixture := loadSnapshots(t, name)

		for _, tc := range fixture.Cases {
			t.Run(tc.Name, func(t *testing.T) {
				t.Parallel()

				known, hasKnown := knownDivergences()[tc.Name]
				if hasKnown && known.steps == nil {
					t.Skip(known.reason)
				}

				term := vt.New(tc.Cols, tc.Rows, vt.WithScrollback(tc.Scrollback))

				for i, step := range tc.Steps {
					if step.Expect != nil && step.Expect.StaleRows && !hasKnown {
						t.Errorf("after step %d xterm.js read rows past the end of its row list; list the case in knownDivergences", i)
					}

					if step.Resize != nil {
						term.Resize(step.Resize[0], step.Resize[1])
					} else {
						data := stepBytes(t, step)
						if data == nil {
							t.Fatalf("step %d has no write or resize", i)
						}

						write(term, data)
					}

					if step.Expect == nil || (hasKnown && known.covers(i)) {
						continue
					}

					if problems := diffSnapshots(step.Expect, takeSnapshot(term)); len(problems) > 0 {
						t.Errorf("after step %d:\n  %s", i, strings.Join(problems, "\n  "))
					}
				}
			})
		}
	}
}

func TestReplayMatchesXtermSnapshots(t *testing.T) {
	t.Parallel()

	replay(t, func(term *vt.Terminal, data []byte) {
		_, _ = term.Write(data)
	})
}

// TestReplayByteByByte feeds every fixture one byte per write: a PTY can split
// output anywhere, inside an escape sequence or a UTF-8 character.
func TestReplayByteByByte(t *testing.T) {
	t.Parallel()

	replay(t, func(term *vt.Terminal, data []byte) {
		for k := range data {
			_, _ = term.Write(data[k : k+1])
		}
	})
}

// TestCorpusCoversThePrograms keeps the corpus from shrinking unnoticed: each
// program the fidelity gate names is recorded at two sizes or more.
func TestCorpusCoversThePrograms(t *testing.T) {
	t.Parallel()

	fixture := loadSnapshots(t, "vt_corpus")

	sizes := map[string]map[string]bool{}

	for _, tc := range fixture.Cases {
		program, _, _ := strings.Cut(strings.TrimPrefix(tc.Name, "pty-"), "-")
		if sizes[program] == nil {
			sizes[program] = map[string]bool{}
		}

		sizes[program][fmt.Sprintf("%dx%d", tc.Cols, tc.Rows)] = true

		for _, step := range tc.Steps {
			if step.Resize != nil {
				sizes[program][fmt.Sprintf("%dx%d", step.Resize[0], step.Resize[1])] = true
			}
		}
	}

	for _, program := range []string{"claude", "vim", "less", "top", "git", "shell"} {
		if n := len(sizes[program]); n < 2 {
			t.Errorf("%s is recorded at %d sizes, want 2 or more", program, n)
		}
	}
}

func screenLines(term *vt.Terminal) []string {
	lines := make([]string, 0, term.Rows())
	for row := range term.Rows() {
		lines = append(lines, term.LineText(row))
	}

	return lines
}

// TestNarrowingReflowDropsTheTopRow covers the known divergence: without
// history, the row pushed off the top by a narrowing reflow is gone, and
// growing back joins what is left.
func TestNarrowingReflowDropsTheTopRow(t *testing.T) {
	t.Parallel()

	term := vt.New(8, 4, vt.WithScrollback(0))
	term.WriteString("ab漢字かなカナxy\r\n")

	term.Resize(5, 4)

	if got, want := screenLines(term), []string{"字か", "なカ", "ナxy", ""}; !slices.Equal(got, want) {
		t.Errorf("after narrowing, rows = %q, want %q", got, want)
	}

	if cur := term.Cursor(); cur.X != 0 || cur.Y != 3 {
		t.Errorf("after narrowing, cursor = %d,%d, want 0,3", cur.X, cur.Y)
	}

	term.Resize(9, 4)

	if got, want := screenLines(term), []string{"字かなカ", "ナxy", "", ""}; !slices.Equal(got, want) {
		t.Errorf("after widening, rows = %q, want %q", got, want)
	}

	if cur := term.Cursor(); cur.X != 0 || cur.Y != 2 {
		t.Errorf("after widening, cursor = %d,%d, want 0,2", cur.X, cur.Y)
	}
}
