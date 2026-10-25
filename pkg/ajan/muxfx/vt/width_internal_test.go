// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

import (
	"slices"
	"testing"
)

// TestGraphemeBreakConformance runs every line of the Unicode 15.1
// GraphemeBreakTest.txt (generated into unicode_grapheme_cases_test.go)
// through the segmenter the terminal joins code points with.
func TestGraphemeBreakConformance(t *testing.T) {
	t.Parallel()

	if unicodeVersion != "15.1.0" {
		t.Fatalf("tables are Unicode %s, want 15.1.0", unicodeVersion)
	}

	for i, want := range graphemeBreakCases {
		var cps []rune
		for _, cluster := range want {
			cps = append(cps, cluster...)
		}

		got := graphemeClusters(cps)
		if !slices.EqualFunc(got, want, slices.Equal[[]rune]) {
			t.Errorf("case %d %U: clusters = %U, want %U", i, cps, got, want)
		}
	}
}

func TestCodePointWidths(t *testing.T) {
	t.Parallel()

	tests := []struct {
		cp    rune
		width int
	}{
		{'a', 1},
		{0x00AD, 1},  // soft hyphen, as glibc and xterm.js have it
		{0x0301, 0},  // combining acute accent
		{0x200B, 0},  // zero width space
		{0x200D, 0},  // zero width joiner
		{0xFE0F, 0},  // emoji variation selector
		{0x1160, 0},  // Hangul medial vowel filler
		{0x1100, 2},  // Hangul initial consonant
		{0x2605, 1},  // black star: ambiguous, narrow
		{0x231A, 2},  // watch: Emoji_Presentation
		{0x1F642, 2}, // slightly smiling face
		{0x1F3FD, 2}, // skin tone modifier: Emoji_Presentation
		{0x1F1F9, 2}, // regional indicator T
		{0x20000, 2}, // CJK extension B
		{0x2FFFD, 2}, // unassigned in plane 2: W by default
		{0xE0067, 0}, // tag letter
	}

	for _, tc := range tests {
		if got := propsOf(tc.cp).width(); got != tc.width {
			t.Errorf("width of %U = %d, want %d", tc.cp, got, tc.width)
		}
	}
}
