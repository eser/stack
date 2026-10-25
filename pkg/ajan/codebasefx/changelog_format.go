// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"regexp"
	"strings"
)

// singleStarEmphasis matches *text* that is not part of **bold**.
var singleStarEmphasis = regexp.MustCompile(`(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*($|[^*\w])`) //nolint:gochecknoglobals

// FormatChangelogSection formats a generated changelog section the way oxfmt
// formats markdown with the repository's settings (proseWrap "preserve"), so
// the release writes CHANGELOG.md already formatted: a list item stays on one
// line and *emphasis* becomes _emphasis_ outside code spans. Other lines
// (headings, blank lines) are left as they are.
func FormatChangelogSection(section string) string {
	lines := strings.Split(section, "\n")

	for i, line := range lines {
		if text, ok := strings.CutPrefix(line, "- "); ok {
			lines[i] = "- " + normalizeEmphasis(text)
		}
	}

	return strings.Join(lines, "\n")
}

// normalizeEmphasis rewrites *x* as _x_ outside code spans.
func normalizeEmphasis(text string) string {
	parts := strings.Split(text, "`")
	for i := 0; i < len(parts); i += 2 {
		// Even parts are outside code spans; run twice for adjacent matches.
		for range 2 {
			parts[i] = singleStarEmphasis.ReplaceAllString(parts[i], "${1}_${2}_${3}")
		}
	}

	return strings.Join(parts, "`")
}
