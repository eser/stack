// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// cellLayout describes a row as its cells: each cell's content and width,
// spacer cells as "|" with width 0.
func cellLayout(term *vt.Terminal, row int) string {
	var b strings.Builder

	for col := range term.Cols() {
		c := term.Cell(row, col)
		if c.Width == 0 && c.Content == "" {
			b.WriteString("[|]")

			continue
		}

		if c.Content == "" && c.Width == 1 && c.Attrs.IsDefault() {
			continue
		}

		b.WriteString("[" + c.Content + ":" + string(rune('0'+c.Width)) + "]")
	}

	return b.String()
}

// TestClustersTakeOneCellGroup checks that the grapheme clusters a modern
// terminal draws as one character take one cell, as wide as the cluster.
func TestClustersTakeOneCellGroup(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		input  string
		layout string
		cursor int
	}{
		{"ZWJ family", "👨\u200d👩\u200d👧x", "[👨\u200d👩\u200d👧:2][|][x:1]", 3},
		{"ZWJ with emoji selector", "🏳\ufe0f\u200d🌈", "[🏳\ufe0f\u200d🌈:2][|]", 2},
		{"profession with skin tone", "👩🏽\u200d💻", "[👩🏽\u200d💻:2][|]", 2},
		{"flags", "🇹🇷🇺🇸", "[🇹🇷:2][|][🇺🇸:2][|]", 4},
		{"tag flag", "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f", "[🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f:2][|]", 2},
		{"skin tones", "👍🏽👋🏿", "[👍🏽:2][|][👋🏿:2][|]", 4},
		{"emoji selector widens", "♥\ufe0fx", "[♥\ufe0f:2][|][x:1]", 3},
		{"text selector narrows", "⌚\ufe0ex", "[⌚\ufe0e:1][x:1]", 2},
		{"keycap", "#\ufe0f\u20e3", "[#\ufe0f\u20e3:2][|]", 2},
		{"combining marks", "e\u0301\u0302a\u0308", "[e\u0301\u0302:1][a\u0308:1]", 2},
		{"wide base with a mark", "漢\u0301", "[漢\u0301:2][|]", 2},
		{"Hangul jamo", "각", "[각:2][|]", 2},
		{"Indic conjunct", "क\u094dषि", "[क\u094dषि:1]", 1},
		{"zero width space in the cell before it", "a\u200bb", "[a\u200b:1][b:1]", 2},
		{"a control sequence ends a cluster", "👍\x1b[m🏽", "[👍:2][|][🏽:2][|]", 4},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			term := vt.New(12, 2)
			term.WriteString(tc.input)

			if got := cellLayout(term, 0); got != tc.layout {
				t.Errorf("cells = %s, want %s", got, tc.layout)
			}

			if cur := term.Cursor(); cur.X != tc.cursor || cur.Y != 0 {
				t.Errorf("cursor = %d,%d, want %d,0", cur.X, cur.Y, tc.cursor)
			}
		})
	}
}

// TestClusterWidensAtTheRightEdge checks that a cluster that a later code
// point widens past the last column moves to the next row whole.
func TestClusterWidensAtTheRightEdge(t *testing.T) {
	t.Parallel()

	term := vt.New(4, 2)
	term.WriteString("abc♥\ufe0f")

	if got := cellLayout(term, 0); got != "[a:1][b:1][c:1]" {
		t.Errorf("row 0 = %s, want a, b and c", got)
	}

	if got := cellLayout(term, 1); got != "[♥\ufe0f:2][|]" {
		t.Errorf("row 1 = %s, want the heart, two wide", got)
	}
}

// TestClusterContentIsBounded checks that a cluster that never ends stays in
// one cell of bounded size.
func TestClusterContentIsBounded(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)
	term.WriteString("👨" + strings.Repeat("\u200d👩", 1000) + "x")

	if n := len(term.Cell(0, 0).Content); n > 256 {
		t.Errorf("cell 0,0 holds %d bytes, want at most 256", n)
	}

	if got := cellLayout(term, 0)[len(cellLayout(term, 0))-5:]; got != "[x:1]" {
		t.Errorf("row ends with %s, want x after the cluster", got)
	}

	if cur := term.Cursor(); cur.X != 3 {
		t.Errorf("cursor at column %d, want 3", cur.X)
	}
}
