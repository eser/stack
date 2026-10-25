// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// frameCopy is a frontend's copy of a pane rebuilt from frames, in the
// terminal's own types so it compares with the terminal directly.
type frameCopy struct {
	rows    [][]vt.Run
	wrapped []bool
	history []vt.HistoryLine
}

func (c *frameCopy) apply(t *testing.T, u *ScreenUpdate) {
	t.Helper()

	if u.Full {
		c.rows = make([][]vt.Run, u.Rows)
		c.wrapped = make([]bool, u.Rows)
	}

	if len(c.rows) != u.Rows {
		t.Fatalf("patch for %d rows on a copy of %d", u.Rows, len(c.rows))
	}

	if len(u.Styles) == 0 || u.Styles[0] != (ScreenStyle{}) {
		t.Fatalf("style 0 = %+v, want the default", u.Styles)
	}

	links := map[uint32]bool{}
	for _, l := range u.Links {
		links[l.Link] = true
	}

	toRuns := func(runs []ScreenRun) []vt.Run {
		out := make([]vt.Run, len(runs))

		for i, r := range runs {
			if r.Link != 0 && !links[r.Link] {
				t.Fatalf("run names link %d, which the message does not list", r.Link)
			}

			out[i] = vt.Run{
				Text: r.Text, Attrs: vt.Attrs(u.Styles[r.Style]), Width: r.Width, Cells: r.Cells,
				Cluster: r.Cluster, Link: r.Link,
			}
		}

		return out
	}

	if u.History != nil {
		if u.History.Reset {
			c.history = nil
		}

		for _, l := range u.History.Lines {
			c.history = append(c.history, vt.HistoryLine{Runs: toRuns(l.Runs), Wrapped: l.Wrapped})
		}
	}

	for _, l := range u.Lines {
		c.rows[l.Row] = toRuns(l.Runs)
		c.wrapped[l.Row] = l.Wrapped
	}
}

// sameRuns compares runs, counting a link the terminal no longer knows as
// none, as frames send it.
func sameRuns(term *vt.Terminal, got, want []vt.Run) bool {
	want = slices.Clone(want)
	for i := range want {
		if _, ok := term.Link(want[i].Link); !ok {
			want[i].Link = 0
		}
	}

	return slices.Equal(got, want)
}

// FuzzScreenFrames writes arbitrary output to a terminal in two parts, with
// a resize between them, builds a frame after each step, sends it through
// its wire form, and checks that a copy rebuilt from what arrived shows what
// the terminal shows, history included.
func FuzzScreenFrames(f *testing.F) {
	f.Add([]byte("hello\r\nworld\x1b[31m red\x1b[0m"), uint8(20), uint8(4), uint8(10), uint8(3), uint16(6))
	f.Add([]byte("\x1b]8;;https://a\x1b\\link\x1b]8;;\x1b\\ 漢字 é\r\n1\r\n2\r\n3\r\n4\r\n5"), uint8(8), uint8(2), uint8(12), uint8(5), uint16(30))
	f.Add([]byte("\x1b[?1049hfull\x1b[5 q\x1b[?1049l\x1b[3J\x1bc"), uint8(10), uint8(3), uint8(4), uint8(2), uint16(9))

	f.Fuzz(func(t *testing.T, data []byte, cols, rows, newCols, newRows uint8, split uint16) {
		term := vt.New(int(cols)%60, int(rows)%20, vt.WithScrollback(int(split%5)*4))
		at := int(split) % (len(data) + 1)

		var (
			view paneView
			cp   frameCopy
		)

		step := func(full bool) {
			built, _ := buildFrame(term, &view, full, 1<<30)

			wire, err := built.MarshalJSON()
			if err != nil || !json.Valid(wire) {
				t.Fatalf("encode %+v = %s (%v)", built, wire, err)
			}

			var u ScreenUpdate
			if err := json.Unmarshal(wire, &u); err != nil {
				t.Fatalf("decode %s: %v", wire, err)
			}

			cp.apply(t, &u)

			for row := range term.Rows() {
				if !sameRuns(term, cp.rows[row], term.LineRuns(row)) || cp.wrapped[row] != term.LineWrapped(row) {
					t.Fatalf("row %d = %+v (wrapped %v), want %+v (wrapped %v)",
						row, cp.rows[row], cp.wrapped[row], term.LineRuns(row), term.LineWrapped(row))
				}
			}

			want := term.History(0, term.HistoryLen())
			if len(cp.history) < len(want) {
				t.Fatalf("copy holds %d history lines, the terminal %d", len(cp.history), len(want))
			}

			got := cp.history[len(cp.history)-len(want):]
			for i := range want {
				if !sameRuns(term, got[i].Runs, want[i].Runs) || got[i].Wrapped != want[i].Wrapped {
					t.Fatalf("history line %d = %+v, want %+v", i, got[i], want[i])
				}
			}

			cursor := term.Cursor()
			if u.Cursor.X != min(cursor.X, term.Cols()-1) || u.Cursor.Y != cursor.Y || u.Cursor.Visible == cursor.Hidden {
				t.Fatalf("cursor = %+v, want %+v", u.Cursor, cursor)
			}
		}

		step(true)

		_, _ = term.Write(data[:at])
		step(false)

		term.Resize(int(newCols)%60, int(newRows)%20)
		step(false)

		_, _ = term.Write(data[at:])
		step(false)
	})
}

func TestBuildFrameReportsNoChange(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3)
	term.WriteString("abc")

	var view paneView

	if _, changed := buildFrame(term, &view, false, DefaultScreenHistory); !changed {
		t.Fatal("first frame reported no change")
	}

	term.WriteString("\x1b[0m\x1b[c")

	if u, changed := buildFrame(term, &view, false, DefaultScreenHistory); changed {
		t.Errorf("frame after output that changed nothing = %+v, want none", u)
	}

	term.WriteString("\x1b]2;title\x07")

	if u, changed := buildFrame(term, &view, false, DefaultScreenHistory); !changed || len(u.Lines) != 0 || u.Title != "title" {
		t.Errorf("frame after a title change = %+v (changed %v), want the title and no rows", u, changed)
	}
}
