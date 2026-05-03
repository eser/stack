// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestSlugFromDescription(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{"simple words", "add user authentication", "add-user-authentication"},
		{"stop words stripped", "add the user authentication", "add-user-authentication"},
		{"stop words only returns spec", "the a an is it", "spec"},
		{"empty string returns spec", "", "spec"},
		{"takes first 6 significant words", "one two three four five six seven eight", "one-two-three-four-five-six"},
		// Absolute paths (with leading /) are fully stripped.
		{"absolute path stripped", "implement /Users/foo/bar.go feature", "implement-feature"},
		// Relative paths (./prefix) are fully stripped.
		{"relative path stripped", "fix ./pkg/ajan/foo.go logic", "fix-logic"},
		// Paths without a leading /: only the portion starting from the first "/"
		// is matched by reSlugStripPaths1 — the word before the slash stays.
		{"inline path prefix kept", "update pkg/ajan/noskillsfx/schema.go types", "update-pkg-types"},
		{"uppercase normalised", "Add User Authentication", "add-user-authentication"},
		{"special chars removed", "add user@auth! feature", "add-userauth-feature"},
		// Truncation triggers only when 6 significant words joined exceed 50 chars.
		// These 6 long words join to 78 chars → truncates to word boundary before 50.
		{"truncates at 50 chars on word boundary", "alphabetical brominated chlorophyll deoxygenated electromagnetically fascinating gloriously", "alphabetical-brominated-chlorophyll-deoxygenated"},
		{"already short slug unchanged", "fix-bug", "fix-bug"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := noskillsfx.SlugFromDescription(tc.input)
			if got != tc.expected {
				t.Errorf("SlugFromDescription(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestLooksLikeDescription(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		input    string
		expected bool
	}{
		{"has space → description", "add user auth", true},
		{"over 50 chars → description", "this-is-a-very-long-slug-that-exceeds-fifty-chars-x", true},
		{"short slug → not description", "fix-bug", false},
		{"exactly 50 chars → not description", "aaaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeeee", false},
		{"empty string → not description", "", false},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := noskillsfx.LooksLikeDescription(tc.input)
			if got != tc.expected {
				t.Errorf("LooksLikeDescription(%q) = %v, want %v", tc.input, got, tc.expected)
			}
		})
	}
}
