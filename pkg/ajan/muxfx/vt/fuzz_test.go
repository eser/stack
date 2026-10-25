// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// Fuzz sizes stay small enough that every input runs fast, and large enough
// for real layouts.
const (
	fuzzMaxCols = 120
	fuzzMaxRows = 50

	// fuzzMaxCellContent is the bound on one cell's content (maxCellContent
	// in handlers.go).
	fuzzMaxCellContent = 256
)

// addFuzzSeeds seeds the fuzzer with every write of the fixtures: real
// program output reaches far more of the parser than random bytes do.
func addFuzzSeeds(f *testing.F) {
	f.Helper()

	f.Add(uint8(80), uint8(24), []byte("hello\r\n\x1b[31mworld\x1b[0m"), uint8(40), uint8(10), uint16(3))

	for _, name := range fixtureNames() {
		raw, err := readFixture(name)
		if err != nil {
			f.Fatalf("read fixture %s: %v", name, err)
		}

		var fixture snapshotFile
		if err := json.Unmarshal(raw, &fixture); err != nil {
			f.Fatalf("parse fixture %s: %v", name, err)
		}

		for _, tc := range fixture.Cases {
			for _, step := range tc.Steps {
				var data []byte

				switch {
				case step.WriteBase64 != nil:
					data, err = base64.StdEncoding.DecodeString(*step.WriteBase64)
					if err != nil {
						f.Fatalf("decode %s: %v", tc.Name, err)
					}
				case step.Write != nil:
					data = []byte(*step.Write)
				default:
					continue
				}

				f.Add(uint8(tc.Cols), uint8(tc.Rows), data, uint8(tc.Cols/2), uint8(tc.Rows+1), uint16(len(data)/2))
			}
		}
	}
}

// checkTerminal asserts the invariants every input must keep: the cursor is
// on the screen (X may equal the width while a wrap is pending) with a known
// style, every cell and row can be read, a cell's content stays within its bound and its link
// id resolves, every row's runs expand back to its cells, and the history
// stays within its limits with runs no wider than the screen.
func checkTerminal(t *testing.T, term *vt.Terminal, scrollback int, phase string) {
	t.Helper()

	cols, rows := term.Cols(), term.Rows()

	if cur := term.Cursor(); cur.X < 0 || cur.X > cols || cur.Y < 0 || cur.Y >= rows {
		t.Fatalf("after %s: cursor %d,%d is off the %dx%d screen", phase, cur.X, cur.Y, cols, rows)
	}

	for row := range rows {
		for col := range cols {
			c := term.Cell(row, col)
			if c.Width < 0 || c.Width > 2 {
				t.Fatalf("after %s: cell %d,%d has width %d", phase, row, col, c.Width)
			}

			if len(c.Content) > fuzzMaxCellContent {
				t.Fatalf("after %s: cell %d,%d holds %d bytes", phase, row, col, len(c.Content))
			}

			if c.Link != 0 {
				_, _ = term.Link(c.Link)
			}
		}

		_ = term.LineText(row)
		_ = term.LineWrapped(row)

		for col, c := range vt.RunCells(term.LineRuns(row), cols) {
			if want := term.Cell(row, col); c != want {
				t.Fatalf("after %s: the runs of row %d give %+v at column %d, want %+v", phase, row, c, col, want)
			}
		}
	}

	if style := term.CursorStyle(); style.Shape > vt.CursorShapeBar || style.Blink > vt.CursorBlinkOff {
		t.Fatalf("after %s: cursor style %+v is out of range", phase, style)
	}

	if n := term.HistoryLen(); n > scrollback {
		t.Fatalf("after %s: %d history lines, over the limit %d", phase, n, scrollback)
	}

	if n := term.HistoryBytes(); n > vt.DefaultScrollbackBytes {
		t.Fatalf("after %s: history holds %d bytes, over the limit", phase, n)
	}

	for i, l := range term.History(0, term.HistoryLen()) {
		width := 0
		for _, r := range l.Runs {
			width += r.Cells
		}

		if width > cols {
			t.Fatalf("after %s: history line %d covers %d columns of %d", phase, i, width, cols)
		}
	}
}

// FuzzTerminalWrite feeds arbitrary bytes to a terminal of an arbitrary size,
// resizes it part way, and checks that nothing panics and the
// cursor stays on the screen. Run it with
// go test -run '^$' -fuzz FuzzTerminalWrite -fuzztime 10m ./pkg/ajan/muxfx/vt/
// and commit what it adds under testdata/fuzz as regression inputs.
func FuzzTerminalWrite(f *testing.F) {
	addFuzzSeeds(f)

	f.Fuzz(func(t *testing.T, cols, rows uint8, data []byte, newCols, newRows uint8, split uint16) {
		// The history limit comes from the split point, so the inputs saved
		// before the history existed keep their meaning; small limits fill
		// up and drop lines.
		scrollback := int(split%7) * 3

		// A reply writer makes the terminal answer DSR and DA requests too.
		term := vt.New(int(cols)%fuzzMaxCols, int(rows)%fuzzMaxRows,
			vt.WithReplyWriter(func([]byte) {}), vt.WithScrollback(scrollback))

		at := int(split) % (len(data) + 1)

		_, _ = term.Write(data[:at])
		checkTerminal(t, term, scrollback, "the first write")
		_ = term.DrainHistory()

		term.Resize(int(newCols)%fuzzMaxCols, int(newRows)%fuzzMaxRows)
		checkTerminal(t, term, scrollback, "the resize")

		if update := term.DrainHistory(); len(update.Lines) > scrollback {
			t.Fatalf("a drain returned %d lines, over the limit %d", len(update.Lines), scrollback)
		}

		_, _ = term.Write(data[at:])
		checkTerminal(t, term, scrollback, "the second write")
	})
}
