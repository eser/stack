// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// screenOf is a frontend's copy of term after the full screen message the
// server would send for it.
func screenOf(term *vt.Terminal) *paneScreen {
	update, _ := buildFrame(term, &paneView{}, true, 0)

	screen := newPaneScreen()
	screen.apply(&update)

	return screen
}

func renderScreen(screen *paneScreen, rect paneRect, full bool) string {
	var out strings.Builder

	screen.render(&out, rect, full)

	return out.String()
}

func TestPaneScreenRender(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		cols    int
		rows    int
		output  string
		rect    paneRect
		want    string
		notWant string
	}{
		{
			name: "positions rows at the offset", cols: 5, rows: 3, output: "hello\r\n",
			rect: paneRect{row: 10, col: 20, width: 5, height: 3}, want: "\x1b[10;20Hhello",
		},
		{
			name: "emits the foreground once per run", cols: 10, rows: 3, output: "\x1b[31mred\x1b[0m x",
			rect: paneRect{row: 1, col: 1, width: 10, height: 3}, want: "\x1b[31mred\x1b[0m x",
		},
		{
			name: "emits text attributes", cols: 10, rows: 3, output: "\x1b[1;4;38;5;200mb",
			rect: paneRect{row: 1, col: 1, width: 10, height: 3}, want: "\x1b[1;4;38;5;200mb\x1b[0m",
		},
		{
			name: "leaves backgrounds out", cols: 10, rows: 3, output: "\x1b[41mBG",
			rect: paneRect{row: 1, col: 1, width: 10, height: 3}, notWant: "41m",
		},
		{
			name: "draws the cursor inverse", cols: 10, rows: 3, output: "ab",
			rect: paneRect{row: 1, col: 1, width: 10, height: 3}, want: "ab\x1b[7m \x1b[27m",
		},
		{
			name: "leaves out a hidden cursor", cols: 10, rows: 3, output: "ab\x1b[?25l",
			rect: paneRect{row: 1, col: 1, width: 10, height: 3}, notWant: "\x1b[7m",
		},
		{
			name: "writes a wide character once", cols: 6, rows: 1, output: "漢x\x1b[1;6H",
			rect: paneRect{row: 1, col: 1, width: 6, height: 1}, want: "\x1b[1;1H漢x  \x1b[7m \x1b[27m",
		},
		{
			name: "draws a wide character cut by the edge as a space", cols: 6, rows: 1, output: "abcd漢\x1b[?25l",
			rect: paneRect{row: 1, col: 1, width: 5, height: 1}, want: "\x1b[1;1Habcd ", notWant: "漢",
		},
		{
			name: "cuts rows below the rect", cols: 5, rows: 3, output: "a\r\nb\r\nc",
			rect: paneRect{row: 1, col: 1, width: 5, height: 2}, notWant: "\x1b[3;1H",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			term := vt.New(tc.cols, tc.rows)
			term.WriteString(tc.output)

			out := renderScreen(screenOf(term), tc.rect, true)

			if tc.want != "" && !strings.Contains(out, tc.want) {
				t.Errorf("output %q lacks %q", out, tc.want)
			}

			if tc.notWant != "" && strings.Contains(out, tc.notWant) {
				t.Errorf("output %q has %q", out, tc.notWant)
			}
		})
	}
}

func TestPaneScreenRedrawsChangedRows(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3)
	term.WriteString("line0\r\nline1\r\nline2")

	view := &paneView{}
	update, _ := buildFrame(term, view, true, 0)

	screen := newPaneScreen()
	screen.apply(&update)

	rect := paneRect{row: 1, col: 1, width: 10, height: 3}
	renderScreen(screen, rect, false)

	term.WriteString("\x1b[1;1HXXX")
	patch, _ := buildFrame(term, view, false, 0)
	screen.apply(&patch)

	out := renderScreen(screen, rect, false)

	if !strings.Contains(out, "\x1b[1;1HXXX") {
		t.Errorf("output %q does not redraw row 1", out)
	}

	// Row 3 held the cursor before, so it is redrawn to erase it; row 2 did
	// not change.
	if strings.Contains(out, "\x1b[2;1H") {
		t.Errorf("output %q redraws the unchanged row 2", out)
	}

	if !strings.Contains(out, "\x1b[3;1H") {
		t.Errorf("output %q does not redraw the previous cursor row", out)
	}

	if out := renderScreen(screen, rect, false); out != "" {
		t.Errorf("an unchanged screen redraws %q", out)
	}
}

// TestPaneScreenBoundsRemoteInput feeds a screen message no server of ours
// sends: it must neither panic nor pass a control sequence to the host.
func TestPaneScreenBoundsRemoteInput(t *testing.T) {
	t.Parallel()

	screen := newPaneScreen()
	screen.apply(&ScreenUpdate{
		Full:   true,
		Cols:   1 << 30,
		Rows:   4,
		Cursor: ScreenCursor{X: -3, Y: 99, Visible: true},
		Styles: []ScreenStyle{{}},
		Lines: []ScreenLine{
			{Row: 0, Runs: []ScreenRun{
				{Text: "a\x1b]0;x\x07b\u009b2J", Width: 1, Cells: 11},
				{Text: "", Width: 1, Cells: -40},
				{Text: "c", Style: 7, Width: -1, Cells: 1},
			}},
			{Row: -1, Runs: []ScreenRun{{Text: "lost", Width: 1, Cells: 4}}},
			{Row: 9, Runs: []ScreenRun{{Text: "lost", Width: 1, Cells: 4}}},
		},
	})

	if screen.cols != MaxRemoteViewportCols {
		t.Errorf("cols = %d, want %d", screen.cols, MaxRemoteViewportCols)
	}

	out := renderScreen(screen, paneRect{row: 1, col: 1, width: 20, height: 4}, true)

	if !strings.Contains(out, "\x1b[1;1Ha ]0;x b 2Jc") {
		t.Errorf("row 0 = %q", out)
	}

	if strings.Contains(out, "lost") {
		t.Errorf("rows out of range were drawn: %q", out)
	}

	for _, seq := range []string{"\x07", "\x1b]", "\u009b"} {
		if strings.Contains(out, seq) {
			t.Errorf("output %q passes %q through", out, seq)
		}
	}
}

// TestPaneScreenPaintsTheWireForm decodes a screen message as a remote
// server sends it, runs and lines as arrays with their defaults left out,
// and paints it: the text's control characters become spaces, a run whose
// cells come from a long text is cut at the pane's edge, and a style or a
// row out of range is ignored.
func TestPaneScreenPaintsTheWireForm(t *testing.T) {
	t.Parallel()

	raw := `{"t":"screen","pane":"pane-1","screen":{"full":true,"cols":12,"rows":2,` +
		`"cursor":{"x":0,"y":1,"visible":false},"title":"","mouse":"none","altScreen":false,` +
		`"styles":[{},{"fg":{"mode":1,"value":1}}],` +
		`"lines":[[0,[["ab",1],["",0,2],["漢",0,2,2],["\u001b]0;x\u0007"]]],` +
		`[1,[["` + strings.Repeat("y", 40) + `",9]],1],[5,[["lost"]]]]}}`

	var msg ServerToFrontend
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatalf("decode: %v", err)
	}

	screen := newPaneScreen()
	screen.apply(msg.Screen)

	out := renderScreen(screen, paneRect{row: 1, col: 1, width: 12, height: 2}, true)

	for _, want := range []string{"\x1b[1;1H\x1b[31mab\x1b[0m  漢 ]0;x ", "\x1b[2;1H" + strings.Repeat("y", 12)} {
		if !strings.Contains(out, want) {
			t.Errorf("output %q lacks %q", out, want)
		}
	}

	for _, unwanted := range []string{"\x07", "\x1b]", "lost", strings.Repeat("y", 13)} {
		if strings.Contains(out, unwanted) {
			t.Errorf("output %q has %q", out, unwanted)
		}
	}
}
