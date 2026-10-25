// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// changelogWidth is the line width deno fmt (dprint) wraps markdown prose at.
const changelogWidth = 80

// singleStarEmphasis matches *text* that is not part of **bold**.
var singleStarEmphasis = regexp.MustCompile(`(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*($|[^*\w])`) //nolint:gochecknoglobals

// FormatChangelogSection formats a generated changelog section the way deno
// fmt formats markdown, so the release writes CHANGELOG.md already formatted:
// list items wrap greedily at 80 columns with a two-space continuation
// indent, code spans and links stay whole on one line, and *emphasis* becomes
// _emphasis_. Other lines (headings, blank lines) are left as they are.
func FormatChangelogSection(section string) string {
	lines := strings.Split(section, "\n")
	out := make([]string, 0, len(lines))

	for _, line := range lines {
		text, ok := strings.CutPrefix(line, "- ")
		if !ok {
			out = append(out, line)

			continue
		}

		out = append(out, wrapListItem(normalizeEmphasis(text))...)
	}

	return strings.Join(out, "\n")
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

// wrapListItem wraps one "- " item into lines of at most changelogWidth; a
// token longer than the width gets a line of its own.
func wrapListItem(text string) []string {
	var lines []string

	current := ""

	for _, tok := range proseTokens(text) {
		switch {
		case current == "":
			current = "- " + tok
		case utf8.RuneCountInString(current)+1+utf8.RuneCountInString(tok) > changelogWidth:
			lines = append(lines, current)
			current = "  " + tok
		default:
			current += " " + tok
		}
	}

	if current == "" {
		current = "-"
	}

	return append(lines, current)
}

// proseTokens splits text at spaces, keeping code spans and links (with the
// spaces inside them) as single tokens.
func proseTokens(text string) []string {
	var (
		tokens []string
		cur    strings.Builder
	)

	flush := func() {
		if cur.Len() > 0 {
			tokens = append(tokens, cur.String())
			cur.Reset()
		}
	}

	for i := 0; i < len(text); {
		c := text[i]

		switch c {
		case ' ':
			flush()
			i++
		case '`':
			run := 0
			for i+run < len(text) && text[i+run] == '`' {
				run++
			}

			fence := strings.Repeat("`", run)
			end := strings.Index(text[i+run:], fence)

			if end < 0 {
				cur.WriteString(fence)
				i += run

				continue
			}

			cur.WriteString(text[i : i+run+end+run])
			i += run + end + run
		case '[':
			if link := linkLength(text[i:]); link > 0 {
				cur.WriteString(text[i : i+link])
				i += link

				continue
			}

			cur.WriteByte(c)
			i++
		default:
			cur.WriteByte(c)
			i++
		}
	}

	flush()

	return tokens
}

// linkLength returns the length of a [text](url) link at the start of s, or 0.
func linkLength(s string) int {
	closeText := strings.Index(s, "](")
	if closeText < 0 || strings.Contains(s[:closeText], "\n") {
		return 0
	}

	closeURL := strings.IndexByte(s[closeText+2:], ')')
	if closeURL < 0 {
		return 0
	}

	return closeText + 2 + closeURL + 1
}
