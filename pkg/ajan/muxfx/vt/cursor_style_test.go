// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// The expectations follow xterm.js 6's setCursorStyle, which the
// cursor-style-* fixture cases also record.
func TestCursorStyle(t *testing.T) {
	t.Parallel()

	block, underline, bar := vt.CursorShapeBlock, vt.CursorShapeUnderline, vt.CursorShapeBar
	on, off := vt.CursorBlinkOn, vt.CursorBlinkOff

	tests := []struct {
		name  string
		input string
		want  vt.CursorStyle
	}{
		{"untouched", "", vt.CursorStyle{}},
		{"1 is a blinking block", "\x1b[1 q", vt.CursorStyle{Shape: block, Blink: on}},
		{"2 is a steady block", "\x1b[2 q", vt.CursorStyle{Shape: block, Blink: off}},
		{"3 is a blinking underline", "\x1b[3 q", vt.CursorStyle{Shape: underline, Blink: on}},
		{"4 is a steady underline", "\x1b[4 q", vt.CursorStyle{Shape: underline, Blink: off}},
		{"5 is a blinking bar", "\x1b[5 q", vt.CursorStyle{Shape: bar, Blink: on}},
		{"6 is a steady bar", "\x1b[6 q", vt.CursorStyle{Shape: bar, Blink: off}},
		{"0 gives both back to the frontend", "\x1b[6 q\x1b[0 q", vt.CursorStyle{}},
		{"no parameter is 0", "\x1b[6 q\x1b[ q", vt.CursorStyle{}},
		{"an unknown parameter keeps the shape and sets blinking", "\x1b[6 q\x1b[7 q", vt.CursorStyle{Shape: bar, Blink: on}},
		{"an unknown parameter alone sets only blinking", "\x1b[8 q", vt.CursorStyle{Blink: off}},
		{"the last sequence wins", "\x1b[3 q\x1b[2 q", vt.CursorStyle{Shape: block, Blink: off}},
		{"a full reset clears it", "\x1b[5 q\x1bc", vt.CursorStyle{}},
		{"a soft reset clears it", "\x1b[5 q\x1b[!p", vt.CursorStyle{}},
		{"the alternate screen keeps it", "\x1b[4 q\x1b[?1049h\x1b[?1049l", vt.CursorStyle{Shape: underline, Blink: off}},
		{"a cursor restore keeps it", "\x1b7\x1b[5 q\x1b8", vt.CursorStyle{Shape: bar, Blink: on}},
		{"without the space it is not DECSCUSR", "\x1b[5q", vt.CursorStyle{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			term := vt.New(10, 3)
			term.WriteString(tc.input)

			if got := term.CursorStyle(); got != tc.want {
				t.Errorf("cursor style = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestCursorShapeString(t *testing.T) {
	t.Parallel()

	want := map[vt.CursorShape]string{
		vt.CursorShapeDefault:   "default",
		vt.CursorShapeBlock:     "block",
		vt.CursorShapeUnderline: "underline",
		vt.CursorShapeBar:       "bar",
	}

	for shape, name := range want {
		if got := shape.String(); got != name {
			t.Errorf("%d.String() = %q, want %q", shape, got, name)
		}
	}
}
