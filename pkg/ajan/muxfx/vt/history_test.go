// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// historyText returns the text of history lines, without trailing blanks.
func historyText(lines []vt.HistoryLine) []string {
	out := make([]string, 0, len(lines))

	for _, l := range lines {
		var text strings.Builder
		for _, r := range l.Runs {
			if r.Text == "" {
				text.WriteString(strings.Repeat(" ", r.Cells))
			} else {
				text.WriteString(r.Text)
			}
		}

		out = append(out, strings.TrimRight(text.String(), " "))
	}

	return out
}

func numberedLines(from, to int) string {
	var b strings.Builder
	for i := from; i <= to; i++ {
		fmt.Fprintf(&b, "%d\r\n", i)
	}

	return b.String()
}

func TestHistoryKeepsLinesUpToTheLineLimit(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3, vt.WithScrollback(4))
	term.WriteString(numberedLines(1, 10))

	// The screen shows 9, 10 and the empty row after them; 1 to 4 are gone.
	got := historyText(term.History(0, term.HistoryLen()))
	if want := []string{"5", "6", "7", "8"}; !slices.Equal(got, want) {
		t.Errorf("history = %q, want %q", got, want)
	}

	if got, want := screenLines(term), []string{"9", "10", ""}; !slices.Equal(got, want) {
		t.Errorf("screen = %q, want %q", got, want)
	}
}

func TestHistoryKeepsLinesUpToTheByteLimit(t *testing.T) {
	t.Parallel()

	// Each line of 40 characters costs its text, one run and the line's
	// bookkeeping; 2000 bytes hold a handful of them.
	const limit = 2000

	term := vt.New(40, 2, vt.WithScrollbackBytes(limit))

	for i := range 100 {
		term.WriteString(fmt.Sprintf("%02d%s\r\n", i, strings.Repeat("x", 38)))
	}

	if got := term.HistoryBytes(); got > limit || got == 0 {
		t.Errorf("history holds %d bytes, want 1 to %d", got, limit)
	}

	lines := historyText(term.History(0, term.HistoryLen()))
	if len(lines) == 0 || !strings.HasPrefix(lines[len(lines)-1], "98") {
		t.Errorf("history = %q, want it to end with line 98", lines)
	}
}

// TestHistoryBoundsHugeCells checks the default byte limit against a stream
// of cells full of combining marks, the largest a cell gets.
func TestHistoryBoundsHugeCells(t *testing.T) {
	t.Parallel()

	term := vt.New(80, 2)
	cell := "e" + strings.Repeat("\u0301", 127)
	row := strings.Repeat(cell, 80)

	for range 1000 {
		term.WriteString(row)
	}

	if got := term.HistoryBytes(); got > vt.DefaultScrollbackBytes {
		t.Errorf("history holds %d bytes, over the default limit %d", got, vt.DefaultScrollbackBytes)
	}

	if term.HistoryLen() >= 1000 {
		t.Errorf("history holds %d lines; the byte limit should have dropped some", term.HistoryLen())
	}
}

func TestAlternateScreenKeepsNoHistory(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3)
	term.WriteString(numberedLines(1, 5))

	before := term.HistoryLen()

	term.WriteString("\x1b[?1049h" + numberedLines(100, 140) + "\x1b[?1049l")

	if got := term.HistoryLen(); got != before {
		t.Errorf("history has %d lines after the alternate screen scrolled, want %d", got, before)
	}

	if got := historyText(term.History(0, term.HistoryLen())); !slices.Equal(got, []string{"1", "2", "3"}) {
		t.Errorf("history = %q, want the normal screen's lines", got)
	}
}

func TestDrainHistoryReturnsTheLinesAddedSinceTheLastCall(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2, vt.WithScrollback(5))

	if update := term.DrainHistory(); update.Reset || len(update.Lines) != 0 {
		t.Errorf("first drain = %+v, want nothing", update)
	}

	term.WriteString("\x1b[31mred\x1b[m\r\n" + numberedLines(2, 3))

	update := term.DrainHistory()
	if update.Reset {
		t.Error("appending lines reported a reset")
	}

	if got := historyText(update.Lines); !slices.Equal(got, []string{"red", "2"}) {
		t.Errorf("drained = %q, want red and 2", got)
	}

	if runs := update.Lines[0].Runs; len(runs) != 1 || runs[0].Attrs.Fg != (vt.Color{Mode: vt.ColorPalette16, Value: 1}) {
		t.Errorf("first drained line runs = %+v, want one red run", runs)
	}

	if update := term.DrainHistory(); len(update.Lines) != 0 {
		t.Errorf("second drain = %q, want nothing", historyText(update.Lines))
	}

	// More lines than the limit between two drains: only the ones kept.
	term.WriteString(numberedLines(4, 20))

	if got := historyText(term.DrainHistory().Lines); !slices.Equal(got, []string{"15", "16", "17", "18", "19"}) {
		t.Errorf("drained = %q, want 15 to 19", got)
	}
}

func TestDrainHistoryReportsRewrites(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		change func(term *vt.Terminal)
		want   []string
	}{
		{"a resize re-wraps", func(term *vt.Terminal) { term.Resize(4, 2) }, []string{"0123", "4567", "89", "1"}},
		{"a taller screen takes lines back", func(term *vt.Terminal) { term.Resize(10, 3) }, []string{"0123456789"}},
		{"ED 3 clears", func(term *vt.Terminal) { term.WriteString("\x1b[3J") }, []string{}},
		{"RIS clears", func(term *vt.Terminal) { term.WriteString("\x1bc") }, []string{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// The history holds 0123456789 and 1; the screen shows 2 and 3.
			term := vt.New(10, 2)
			term.WriteString("0123456789\r\n1\r\n2\r\n3")
			_ = term.DrainHistory()

			tc.change(term)

			update := term.DrainHistory()
			if !update.Reset {
				t.Fatalf("drain after the change = %+v, want a reset", update)
			}

			if got := historyText(update.Lines); !slices.Equal(got, tc.want) {
				t.Errorf("history after the change = %q, want %q", got, tc.want)
			}

			if again := term.DrainHistory(); again.Reset || len(again.Lines) != 0 {
				t.Errorf("drain after the reset = %+v, want nothing", again)
			}
		})
	}
}

// TestLineRunsRoundTrip checks that the runs of every screen row expand back
// to its cells.
func TestLineRunsRoundTrip(t *testing.T) {
	t.Parallel()

	term := vt.New(12, 4)
	term.WriteString("\x1b[1mbold\x1b[m 漢字 e\u0301\r\n\x1b[44m\x1b[Kblue\x1b[m\r\n♥\ufe0f🙂 \x1b[4:3mcurly\x1b[m")
	term.Resize(7, 4)

	for row := range term.Rows() {
		cells := vt.RunCells(term.LineRuns(row), term.Cols())

		for col, c := range cells {
			if want := term.Cell(row, col); c != want {
				t.Errorf("row %d col %d = %+v, want %+v", row, col, c, want)
			}
		}
	}

	if runs := term.LineRuns(-1); runs != nil {
		t.Errorf("LineRuns(-1) = %+v, want nil", runs)
	}
}

func TestHistoryStamp(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3, vt.WithScrollback(5))
	if got := term.HistoryStamp(); got != (vt.HistoryStamp{}) {
		t.Fatalf("fresh stamp = %+v, want zero", got)
	}

	term.WriteString(numberedLines(1, 4))

	before := term.HistoryStamp()
	if before != (vt.HistoryStamp{Added: 2}) {
		t.Fatalf("stamp after 4 lines on 3 rows = %+v, want 2 added", before)
	}

	// Past the line limit the oldest go, and Added keeps counting, so a
	// consumer reads the lines it has not seen from the bottom.
	term.WriteString(numberedLines(5, 10))

	after := term.HistoryStamp()

	added := int(after.Added - before.Added)
	if after.Rewrites != before.Rewrites || added != 6 {
		t.Fatalf("stamp = %+v after %+v, want 6 more added and no rewrite", after, before)
	}

	got := historyText(term.History(term.HistoryLen()-min(added, term.HistoryLen()), term.HistoryLen()))
	if want := []string{"4", "5", "6", "7", "8"}; !slices.Equal(got, want) {
		t.Errorf("new lines still held = %q, want %q", got, want)
	}

	// Draining does not touch the stamp; a resize, ED 3 and RIS rewrite.
	term.DrainHistory()

	if term.HistoryStamp() != after {
		t.Error("DrainHistory changed the stamp")
	}

	for _, step := range []struct {
		name  string
		apply func()
	}{
		{"resize", func() { term.Resize(8, 3) }},
		{"ED 3", func() { term.WriteString("\x1b[3J") }},
		{"RIS", func() { term.WriteString(numberedLines(1, 6) + "\x1bc") }},
	} {
		previous := term.HistoryStamp()
		step.apply()

		if got := term.HistoryStamp(); got.Rewrites != previous.Rewrites+1 {
			t.Errorf("%s: rewrites = %d, want %d", step.name, got.Rewrites, previous.Rewrites+1)
		}
	}
}
