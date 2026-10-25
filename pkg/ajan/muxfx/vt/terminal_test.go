// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

func TestNewClampsToMinimumSize(t *testing.T) {
	t.Parallel()

	term := vt.New(0, 0)
	if term.Cols() != 2 || term.Rows() != 1 {
		t.Errorf("size = %dx%d, want 2x1", term.Cols(), term.Rows())
	}
}

func TestColorsAndAttributes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		col   int
		want  vt.Attrs
	}{
		{"16-colour foreground", "\x1b[31mR", 0, vt.Attrs{Fg: vt.Color{Mode: vt.ColorPalette16, Value: 1}}},
		{"256-colour foreground", "\x1b[38;5;208mX", 0, vt.Attrs{Fg: vt.Color{Mode: vt.ColorPalette256, Value: 208}}},
		{"RGB foreground", "\x1b[38;2;100;200;50mX", 0, vt.Attrs{Fg: vt.Color{Mode: vt.ColorRGB, Value: 6604850}}},
		{"bold", "\x1b[1mB", 0, vt.Attrs{Flags: vt.FlagBold}},
		{"reset clears attributes", "\x1b[1;31mX\x1b[0mN", 1, vt.Attrs{}},
		{"curly underline", "\x1b[4:3mU", 0, vt.Attrs{Flags: vt.FlagUnderline, Underline: vt.UnderlineCurly}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			term := vt.New(20, 5)
			term.WriteString(tc.input)

			if got := term.Cell(0, tc.col).Attrs; got != tc.want {
				t.Errorf("attrs = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestCursorVisibilityAndModes(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3)
	term.WriteString("\x1b[?25l\x1b[?2004h\x1b[?1000h\x1b[?1006h\x1b[?1h")

	if !term.Cursor().Hidden {
		t.Error("cursor not hidden after DECTCEM reset")
	}

	modes := term.Modes()
	if !modes.BracketedPaste || modes.MouseProtocol != vt.MouseVT200 || modes.MouseEncoding != vt.MouseEncodingSGR || !modes.ApplicationCursorKeys {
		t.Errorf("modes = %+v, want bracketed paste, VT200 mouse, SGR encoding, application cursor keys", modes)
	}

	term.WriteString("\x1bc")

	if term.Cursor().Hidden || term.Modes().BracketedPaste {
		t.Error("full reset kept modes")
	}
}

func TestTitleFromOSC(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 3)
	term.WriteString("\x1b]2;my title\x07")

	if term.Title() != "my title" {
		t.Errorf("title = %q, want %q", term.Title(), "my title")
	}
}

func TestReplyWriter(t *testing.T) {
	t.Parallel()

	var replies []string

	term := vt.New(20, 5, vt.WithReplyWriter(func(reply []byte) {
		replies = append(replies, string(reply))
	}))
	term.WriteString("\x1b[3;7H\x1b[6n\x1b[5n\x1b[c")

	want := []string{"\x1b[3;7R", "\x1b[0n", "\x1b[?1;2c"}
	if strings.Join(replies, "|") != strings.Join(want, "|") {
		t.Errorf("replies = %q, want %q", replies, want)
	}
}
