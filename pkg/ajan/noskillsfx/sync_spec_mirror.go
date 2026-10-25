// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// The spec.md reader the Kiro and OpenCode adapters share (parseSpecMd in
// both adapters): the title and the sections their spec copies take.

var (
	mirrorHeadingPrefix = regexp.MustCompile(`^###` + jsSpace + `*`)  //nolint:gochecknoglobals // compiled once
	mirrorBulletPrefix  = regexp.MustCompile(`^[-*]` + jsSpace + `*`) //nolint:gochecknoglobals // compiled once
)

type parsedSpec struct {
	title            string
	concerns         string
	discoveryAnswers string
	contributorGuide string
	publicAPI        string
	outOfScope       string
	tasks            string
	verification     string
}

// readSpecMirror reads a spec.md for the spec copies: ok is false when the
// file cannot be read or holds only whitespace.
func readSpecMirror(path string) (*parsedSpec, bool) {
	content, ok := readOptionalFile(path)
	if !ok || jsTrim(content) == "" {
		return nil, false
	}

	return parseSpecMd(content), true
}

// isLineStart reports whether offset i of s starts a line for a multiline
// JavaScript `^`: the start of the text or after a line terminator.
func isLineStart(s string, i int) bool {
	if i == 0 {
		return true
	}

	r, _ := utf8.DecodeLastRuneInString(s[:i])

	return isJSLineTerminator(r)
}

// specTitle is `content.match(/^# Spec:\s*(.+)$/m)?.[1]?.trim()`, with the
// backtracking of `\s*` into the title the regular expression allows.
func specTitle(content string) (string, bool) {
	const marker = "# Spec:"

	for from := 0; from <= len(content); {
		at := strings.Index(content[from:], marker)
		if at == -1 {
			return "", false
		}

		at += from
		from = at + 1

		if !isLineStart(content, at) {
			continue
		}

		rest := content[at+len(marker):]

		// The ends of the leading whitespace run, longest first: `.+` needs
		// a character that does not end a line where `\s*` stops.
		var stops []int

		offset := 0

		for {
			stops = append(stops, offset)

			r, size := utf8.DecodeRuneInString(rest[offset:])
			if size == 0 || !isJSSpace(r) {
				break
			}

			offset += size
		}

		for i := len(stops) - 1; i >= 0; i-- {
			start := stops[i]

			r, size := utf8.DecodeRuneInString(rest[start:])
			if size == 0 || isJSLineTerminator(r) {
				continue
			}

			end := start
			for end < len(rest) {
				r, size = utf8.DecodeRuneInString(rest[end:])
				if isJSLineTerminator(r) {
					break
				}

				end += size
			}

			return jsTrim(rest[start:end]), true
		}
	}

	return "", false
}

// splitAtHeadings is `content.split(/^## /m)`.
func splitAtHeadings(content string) []string {
	const marker = "## "

	var parts []string

	last := 0

	for from := 0; from <= len(content); {
		at := strings.Index(content[from:], marker)
		if at == -1 {
			break
		}

		at += from
		from = at + 1

		if !isLineStart(content, at) || at < last {
			continue
		}

		parts = append(parts, content[last:at])
		last = at + len(marker)
		from = last
	}

	return append(parts, content[last:])
}

func parseSpecMd(content string) *parsedSpec {
	title, ok := specTitle(content)
	if !ok {
		title = "Untitled"
	}

	// A Map keeps the first position of a repeated heading and its last body.
	var headings []string

	bodies := map[string]string{}

	for _, part := range splitAtHeadings(content) {
		newline := strings.Index(part, "\n")
		if newline == -1 {
			continue
		}

		heading := jsToLower(jsTrim(part[:newline]))
		if _, seen := bodies[heading]; !seen {
			headings = append(headings, heading)
		}

		bodies[heading] = jsTrim(part[newline+1:])
	}

	find := func(prefix string) string {
		for _, heading := range headings {
			if strings.HasPrefix(heading, prefix) {
				return bodies[heading]
			}
		}

		return ""
	}

	return &parsedSpec{
		title:            title,
		concerns:         find("concerns"),
		discoveryAnswers: find("discovery answers"),
		contributorGuide: find("contributor guide"),
		publicAPI:        find("public api"),
		outOfScope:       find("out of scope"),
		tasks:            find("tasks"),
		verification:     find("verification"),
	}
}
