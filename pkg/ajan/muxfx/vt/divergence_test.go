// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// TestKnownDivergences checks what vt does in each fixture case where it
// deliberately differs from xterm.js (knownDivergences in snapshot_test.go).
func TestKnownDivergences(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		cols, rows int
		scrollback int
		input      string
		resize     []int
		check      func(t *testing.T, term *vt.Terminal)
	}{
		{
			name: "zero-width-in-pending-wrap", cols: 5, rows: 2,
			input: "abcde\x1b[m\u200b\u200bX",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"abcde\u200b\u200b", "X"}, nil, 1, 1)
			},
		},
		{
			name: "rep-after-resize-lone-combining", cols: 3, rows: 2,
			input: "\r\u0301xy", resize: []int{2, 2},
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				// The mark had no cell before it and was dropped. After the
				// resize the cursor is on y, so REP repeats the x before it,
				// as in xterm.js.
				term.WriteString("\x1b[b")
				expectScreen(t, term, []string{"xx", ""}, nil, 2, 0)
			},
		},
		{
			name: "unicode-zero-width-takes-no-cell", cols: 10, rows: 2,
			input: "a\u200bb\u200ec\u2060d\x1b[m\u0301e",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"a\u200bb\u200ec\u2060d\u0301e", ""}, nil, 5, 0)
			},
		},
		{
			name: "unicode-text-selector-narrows", cols: 10, rows: 2,
			input: "\u231a\ufe0ex\u2600\ufe0ey",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"\u231a\ufe0ex\u2600\ufe0ey", ""}, nil, 4, 0)
			},
		},
		{
			name: "unicode-emoji-selector-needs-a-base", cols: 10, rows: 2,
			input: "a\ufe0fb",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"a\ufe0fb", ""}, nil, 2, 0)
			},
		},
		{
			name: "unicode-zwj-needs-a-pictograph", cols: 10, rows: 2,
			input: "a\u200d🙂b",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"a\u200d🙂b", ""}, [][2]int{{0, 1}}, 4, 0)
			},
		},
		{
			name: "unicode-indic-conjunct", cols: 10, rows: 2,
			input: "\u0915\u094d\u0937x",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"\u0915\u094d\u0937x", ""}, nil, 2, 0)

				if got := term.Cell(0, 0).Content; got != "\u0915\u094d\u0937" {
					t.Errorf("cell 0,0 = %q, want the whole conjunct", got)
				}
			},
		},
		{
			name: "unicode-lone-regional-indicator", cols: 10, rows: 2,
			input: "🇹🇷🇺|",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				expectScreen(t, term, []string{"🇹🇷🇺|", ""}, [][2]int{{0, 0}, {0, 2}}, 5, 0)
			},
		},
		{
			name: "sgr-59-white-underline", cols: 10, rows: 2,
			input: "\x1b[4;58;5;196mA\x1b[59mB",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if got := term.Cell(0, 1).Attrs.UnderlineColor; got != (vt.Color{}) {
					t.Errorf("underline colour after SGR 59 = %+v, want the default", got)
				}
			},
		},
		{
			name: "decaln-drops-underline-style", cols: 4, rows: 2,
			input: "\x1b[4:3m\x1b#8",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if got := term.Cell(0, 0).Attrs.Underline; got != vt.UnderlineCurly {
					t.Errorf("DECALN underline style = %d, want curly", got)
				}
			},
		},
		{
			name: "ris-keeps-cursor-hidden", cols: 10, rows: 2,
			input: "\x1b[?25l\x1bc",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if term.Cursor().Hidden {
					t.Error("cursor hidden after RIS")
				}
			},
		},
		{
			name: "one-row-autowrap-recycles-row", cols: 4, rows: 1,
			input: "\x1b[31mabc漢",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if got := term.Cell(0, 3).Attrs; !got.IsDefault() {
					t.Errorf("cell after the wrapped wide character = %+v, want default attributes", got)
				}
			},
		},
		{
			name: "osc8-survives-cursor-restore", cols: 10, rows: 2,
			input: "\x1b7\x1b]8;;http://a\x1b\\a\x1b8b\x1b[1mc",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				for col := range 2 {
					if link, ok := term.CellLink(0, col); !ok || link.URI != "http://a" {
						t.Errorf("cell 0,%d link = %+v, %v, want http://a", col, link, ok)
					}
				}
			},
		},
		{
			name: "osc8-close-with-params", cols: 10, rows: 2,
			input: "\x1b]8;;http://a\x1b\\a\x1b]8;id=x;\x1b\\b",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if link, ok := term.CellLink(0, 0); !ok || link.URI != "http://a" {
					t.Errorf("cell 0,0 link = %+v, %v, want http://a", link, ok)
				}

				if link, ok := term.CellLink(0, 1); ok {
					t.Errorf("cell 0,1 link = %+v, want none", link)
				}
			},
		},
		{
			name: "osc8-uri-too-long", cols: 10, rows: 2,
			input: "\x1b]8;;http://a\x1b\\a\x1b]8;;http://" + strings.Repeat("x", 2100) + "\x1b\\b",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				if _, ok := term.CellLink(0, 0); !ok {
					t.Error("cell 0,0 has no link, want http://a")
				}

				if link, ok := term.CellLink(0, 1); ok {
					t.Errorf("cell 0,1 link = %+v, want none after a URI past the bound", link)
				}
			},
		},
		{
			name: "ed1-unwraps-a-history-line", cols: 4, rows: 2, scrollback: 10,
			input: "abcdefgh\r\n12\r\n\x1b[1;4H\x1b[1J",
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				history := term.History(0, term.HistoryLen())
				if len(history) != 2 || !history[1].Wrapped {
					t.Errorf("history = %+v, want abcd and efgh, efgh still wrapped", history)
				}
			},
		},
		{
			name: "reflow-moves-combined-chars", cols: 4, rows: 3,
			input:  "ba\u0308e\u0301ca\u0308e\u0301\r\n",
			resize: []int{3, 3},
			check: func(t *testing.T, term *vt.Terminal) {
				t.Helper()

				want := []string{"ba\u0308e\u0301", "ca\u0308e\u0301", ""}
				if got := screenLines(term); !slices.Equal(got, want) {
					t.Errorf("rows = %q, want %q", got, want)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if _, ok := knownDivergences()[tc.name]; !ok {
				t.Fatalf("%s is not listed in knownDivergences", tc.name)
			}

			term := vt.New(tc.cols, tc.rows, vt.WithScrollback(tc.scrollback))
			term.WriteString(tc.input)

			if tc.resize != nil {
				term.Resize(tc.resize[0], tc.resize[1])
			}

			tc.check(t, term)
		})
	}
}

// expectScreen checks a hand-checked screen: the rows' text, the cells that
// are two columns wide (row, col), and the cursor.
func expectScreen(t *testing.T, term *vt.Terminal, rows []string, wide [][2]int, x, y int) {
	t.Helper()

	if got := screenLines(term); !slices.Equal(got, rows) {
		t.Errorf("rows = %q, want %q", got, rows)
	}

	var gotWide [][2]int

	for row := range term.Rows() {
		for col := range term.Cols() {
			if term.Cell(row, col).Width == 2 {
				gotWide = append(gotWide, [2]int{row, col})
			}
		}
	}

	if !slices.Equal(gotWide, wide) {
		t.Errorf("wide cells = %v, want %v", gotWide, wide)
	}

	if cur := term.Cursor(); cur.X != x || cur.Y != y {
		t.Errorf("cursor = %d,%d, want %d,%d", cur.X, cur.Y, x, y)
	}
}

// TestNarrowingReflowOfFullRowsDoesNotPanic is the regression case for a
// narrowing reflow that drops rows from the end while it still walks them:
// it indexed past the row list. xterm.js reads stale rows there (a known
// divergence), so the fixture cannot hold this case.
func TestNarrowingReflowOfFullRowsDoesNotPanic(t *testing.T) {
	t.Parallel()

	term := vt.New(5, 3)
	term.WriteString("\x1b#8")
	term.Resize(2, 3)

	if got, want := screenLines(term), []string{"E", "EE", "E"}; !slices.Equal(got, want) {
		t.Errorf("rows = %q, want %q", got, want)
	}

	if cur := term.Cursor(); cur.X != 0 || cur.Y != 2 {
		t.Errorf("cursor = %d,%d, want 0,2", cur.X, cur.Y)
	}
}

// TestHugeCountsAreBounded is the regression case for the fuzzer's finding
// that REP with a count of hundreds of millions allocated that many copies.
// Counts past what the screen holds are reduced without changing the result.
func TestHugeCountsAreBounded(t *testing.T) {
	t.Parallel()

	const maxCount = "2147483647"

	tests := []struct {
		name       string
		huge, same string
	}{
		// REP past (rows+2)*cols copies is reduced by whole rows: on 80x24,
		// 2147483647 copies leave the screen 2127 copies leave (2087 for a wide
		// character, 40 to a row).
		{"REP", "x\x1b[" + maxCount + "b", "x\x1b[2127b"},
		{"REP of a wide character", "漢\x1b[" + maxCount + "b", "漢\x1b[2087b"},
		{"IL", "1\r\n2\r\n3\x1b[2;1H\x1b[" + maxCount + "L", "1\r\n2\r\n3\x1b[2;1H\x1b[24L"},
		{"DL", "1\r\n2\r\n3\x1b[2;1H\x1b[" + maxCount + "M", "1\r\n2\r\n3\x1b[2;1H\x1b[24M"},
		{"SU", "1\r\n2\r\n3\x1b[" + maxCount + "S", "1\r\n2\r\n3\x1b[24S"},
		{"SD", "1\r\n2\r\n3\x1b[" + maxCount + "T", "1\r\n2\r\n3\x1b[24T"},
		{"CHT", "a\x1b[" + maxCount + "I!", "a\x1b[80I!"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			huge := vt.New(80, 24)
			huge.WriteString(tc.huge)

			same := vt.New(80, 24)
			same.WriteString(tc.same)

			if problems := diffSnapshots(takeSnapshot(same), takeSnapshot(huge)); len(problems) > 0 {
				t.Errorf("%s differs from the bounded count: %v", tc.name, problems)
			}
		})
	}
}

// TestCellContentIsBounded checks that combining marks stop joining a cell
// past its bound: without it, one cell, and every REP of it, grows with the
// stream. The cursor and widths are those xterm.js has.
func TestCellContentIsBounded(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)
	term.WriteString("e" + strings.Repeat("\u0301", 10000) + "x\x1b[5b")

	if n := len(term.Cell(0, 0).Content); n > 256 {
		t.Errorf("cell 0,0 holds %d bytes, want at most 256", n)
	}

	if got := term.LineText(0); !strings.HasSuffix(got, "xxxxxx") {
		t.Errorf("row 0 = %q, want it to end with the six x", got)
	}

	if cur := term.Cursor(); cur.X != 7 || cur.Y != 0 {
		t.Errorf("cursor = %d,%d, want 7,0", cur.X, cur.Y)
	}
}

// TestLineTextOfACutWideCharacter is the regression case for the fuzzer's
// finding that LineText indexed past the row when a narrowing resize left a
// wide character in the last column.
func TestLineTextOfACutWideCharacter(t *testing.T) {
	t.Parallel()

	term := vt.New(4, 2)
	term.WriteString("0漢")
	term.Resize(2, 2)

	if got, want := term.LineText(0), "0漢"; got != want {
		t.Errorf("row 0 = %q, want %q", got, want)
	}
}

// TestGrowingAFilledShrunkAlternateScreen is the regression case for a panic
// a differential run found: an alternate screen shrunk while empty keeps its
// taller row list, so once filled it has rows above its screen; growing it
// then appended rows past the list's length, and the next scroll indexed past
// the list. xterm.js reads stale rows there, so the fixture cannot hold it.
func TestGrowingAFilledShrunkAlternateScreen(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 4)
	term.Resize(10, 3)
	term.WriteString("\x1b[?1049h1\r\n2\r\n3\r\n4\x1b[H")
	term.Resize(10, 6)
	term.WriteString("0123456789abcdefghijklmnopqrstuvwxyz\r\n\r\n\r\n\r\nend")

	if got := term.LineText(5); got != "end" {
		t.Errorf("bottom row = %q, want %q", got, "end")
	}
}
