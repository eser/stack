// This module is taken from the Go standard library and
// modified to work with the eser-go framework.

// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the go stdlib's LICENSE
// file.

package uris

import (
	"strings"
)

// commonPath returns a path that both p1 and p2 match.
// It assumes there is such a path.
func CommonPath(p1, p2 *Pattern) string { //nolint:varnamelen
	var (
		b     strings.Builder //nolint:varnamelen
		segs1 []Segment
		segs2 []Segment
	)

	for segs1, segs2 = p1.Segments, p2.Segments; len(segs1) > 0 && len(segs2) > 0; segs1, segs2 = segs1[1:], segs2[1:] {
		s1 := segs1[0] //nolint:varnamelen

		if s1.Wild {
			writeSegment(&b, segs2[0])

			continue
		}

		writeSegment(&b, s1)
	}

	if len(segs1) > 0 {
		writeMatchingPath(&b, segs1)
	} else if len(segs2) > 0 {
		writeMatchingPath(&b, segs2)
	}

	return b.String()
}
