// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

import (
	"reflect"
	"testing"
)

// TestPackedSizes keeps the sizes the history's byte limit counts in step
// with the structs.
func TestPackedSizes(t *testing.T) {
	t.Parallel()

	if got := reflect.TypeFor[line]().Size(); got != lineSize {
		t.Errorf("line is %d bytes, lineSize says %d", got, lineSize)
	}

	if got := reflect.TypeFor[packedRun]().Size(); got != packedRunSize {
		t.Errorf("packedRun is %d bytes, packedRunSize says %d", got, packedRunSize)
	}
}

// TestPackRoundTrip packs rows of every kind of cell and checks that
// unpacking gives the same cells.
func TestPackRoundTrip(t *testing.T) {
	t.Parallel()

	red := Attrs{Fg: Color{Mode: ColorPalette16, Value: 1}}
	blue := Attrs{Bg: Color{Mode: ColorPalette16, Value: 4}}

	tests := []struct {
		name  string
		cells []Cell
	}{
		{"empty", []Cell{emptyCell(Attrs{}), emptyCell(Attrs{})}},
		{"text", []Cell{{Content: "a", Width: 1}, {Content: "b", Width: 1, Attrs: red}, emptyCell(Attrs{})}},
		{"erased background", []Cell{{Content: "x", Width: 1}, emptyCell(blue), emptyCell(blue)}},
		{"wide", []Cell{{Content: "漢", Width: 2}, {Width: 0}, {Content: "字", Width: 2}, {Width: 0}, emptyCell(Attrs{})}},
		{"wide cut at the edge", []Cell{{Content: "a", Width: 1}, {Content: "漢", Width: 2}}},
		{"wide without spacer inside", []Cell{{Content: "漢", Width: 2}, {Content: "b", Width: 1}, emptyCell(Attrs{})}},
		{"cluster", []Cell{{Content: "e\u0301", Width: 1}, {Content: "♥\ufe0f", Width: 2}, {Width: 0}, {Content: "z", Width: 1}}},
		{"stray zero-width blank", []Cell{{Content: "a", Width: 1}, {Width: 0}, {Content: "b", Width: 1}}},
		{"spacer with other attrs", []Cell{{Content: "漢", Width: 2}, {Width: 0, Attrs: red}, emptyCell(Attrs{})}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			l := &line{cells: append([]Cell(nil), tc.cells...), wrapped: true}
			want := l.trimmedLength()

			var rb runBuilder
			l.pack(&rb)

			if got := l.trimmedLength(); got != want {
				t.Errorf("packed trimmedLength = %d, want %d", got, want)
			}

			public := RunCells(publicRuns(l.text, l.runs), len(tc.cells))

			l.unpack()

			if !reflect.DeepEqual(l.cells, tc.cells) {
				t.Errorf("unpacked = %+v, want %+v", l.cells, tc.cells)
			}

			if !reflect.DeepEqual(public, tc.cells) {
				t.Errorf("RunCells = %+v, want %+v", public, tc.cells)
			}

			if !l.wrapped {
				t.Error("the wrapped flag was lost")
			}
		})
	}
}
