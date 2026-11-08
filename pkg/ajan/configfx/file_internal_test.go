// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows

package configfx

import "testing"

// The parents LocateFile visits follow Node's path.posix.dirname, which the
// TypeScript search used: "." and ".." segments stay as written.
func TestDirnameFollowsNode(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"":        ".",
		".":       ".",
		"src":     ".",
		"src/lib": "src",
		"/":       "/",
		"/a":      "/",
		"/a/b/":   "/a",
		"//a":     "//",
		"a/../b":  "a/..",
		"a/..":    "a",
		"../x":    "..",
		"./src/":  ".",
	}

	for in, want := range cases {
		if got := dirname(in); got != want {
			t.Errorf("dirname(%q) = %q, want %q", in, got, want)
		}
	}
}
