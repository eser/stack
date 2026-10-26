// This module is taken from the Go standard library and
// modified to work with the eser-go framework.

// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the go stdlib's LICENSE
// file.

package uris

import (
	"fmt"
	"strings"
)

// DifferencePath returns a path that p1 matches and p2 doesn't.
// It assumes there is such a path.
func DifferencePath(p1, p2 *Pattern) string { //nolint:cyclop,gocognit
	var b strings.Builder //nolint:varnamelen

	var segs1, segs2 []Segment
	for segs1, segs2 = p1.Segments, p2.Segments; len(segs1) > 0 && len(segs2) > 0; segs1, segs2 = segs1[1:], segs2[1:] {
		s1 := segs1[0] //nolint:varnamelen
		s2 := segs2[0] //nolint:varnamelen

		if s1.Multi && s2.Multi {
			// From here the patterns match the same paths, so we must have found a difference earlier.
			b.WriteByte('/')

			return b.String()
		}

		if s1.Multi && !s2.Multi {
			// s1 ends in a "..." wildcard but s2 does not.
			// A trailing slash will distinguish them, unless s2 ends in "{$}",
			// in which case any segment will do; prefer the wildcard name if
			// it has one.
			b.WriteByte('/')

			if s2.Str == "/" {
				if s1.Str != "" {
					b.WriteString(s1.Str)
				} else {
					b.WriteString("x")
				}
			}

			return b.String()
		}

		if !s1.Multi && s2.Multi { //nolint:gocritic,nestif
			writeSegment(&b, s1)
		} else if s1.Wild && s2.Wild {
			// Both patterns will match whatever we put here; use
			// the first wildcard name.
			writeSegment(&b, s1)
		} else if s1.Wild && !s2.Wild {
			// s1 is a wildcard, s2 is a literal.
			// Any segment other than s2.s will work.
			// Prefer the wildcard name, but if it's the same as the literal,
			// tweak the literal.
			if s1.Str != s2.Str {
				writeSegment(&b, s1)
			} else {
				b.WriteByte('/')
				b.WriteString(s2.Str + "x")
			}
		} else if !s1.Wild && s2.Wild {
			writeSegment(&b, s1)
		} else {
			// Both are literals. A precondition of this function is that the
			// patterns overlap, so they must be the same literal. Use it.
			if s1.Str != s2.Str {
				panic(fmt.Sprintf("literals differ: %q and %q", s1.Str, s2.Str))
			}

			writeSegment(&b, s1)
		}
	}

	if len(segs1) > 0 {
		// p1 is longer than p2, and p2 does not end in a multi.
		// Anything that matches the rest of p1 will do.
		writeMatchingPath(&b, segs1)
	} else if len(segs2) > 0 {
		writeMatchingPath(&b, segs2)
	}

	return b.String()
}
