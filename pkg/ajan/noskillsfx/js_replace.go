// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strconv"
	"strings"
)

// String.prototype.replace reads `$` patterns in the replacement text even
// when the pattern is a plain string, so an answer that holds "$&" lands in
// spec.md differently than a plain substitution would put it. These helpers
// keep that behavior.

// jsExpandReplacement expands $$, $&, $`, $' and $n in a replacement.
func jsExpandReplacement(replacement, match, before, after string, groups []string) string {
	if !strings.Contains(replacement, "$") {
		return replacement
	}

	var b strings.Builder

	for i := 0; i < len(replacement); i++ {
		c := replacement[i]
		if c != '$' || i+1 >= len(replacement) {
			b.WriteByte(c)

			continue
		}

		next := replacement[i+1]

		switch {
		case next == '$':
			b.WriteByte('$')
			i++
		case next == '&':
			b.WriteString(match)
			i++
		case next == '`':
			b.WriteString(before)
			i++
		case next == '\'':
			b.WriteString(after)
			i++
		case next >= '0' && next <= '9':
			// Two digits when they name a group, else one.
			if i+2 < len(replacement) && replacement[i+2] >= '0' && replacement[i+2] <= '9' {
				if n, _ := strconv.Atoi(replacement[i+1 : i+3]); n >= 1 && n <= len(groups) {
					b.WriteString(groups[n-1])
					i += 2

					continue
				}
			}

			if n := int(next - '0'); n >= 1 && n <= len(groups) {
				b.WriteString(groups[n-1])
				i++

				continue
			}

			b.WriteByte(c)
		default:
			b.WriteByte(c)
		}
	}

	return b.String()
}

// jsReplaceFirstString is `s.replace(pattern, replacement)` with a string
// pattern: the first occurrence, with the replacement's $ patterns read.
func jsReplaceFirstString(s, pattern, replacement string) string {
	at := strings.Index(s, pattern)
	if at == -1 {
		return s
	}

	before, after := s[:at], s[at+len(pattern):]

	return before + jsExpandReplacement(replacement, pattern, before, after, nil) + after
}

// jsReplaceFirstRegexp is `s.replace(re, replacement)` with a regular
// expression without the g flag.
func jsReplaceFirstRegexp(s string, re *regexp.Regexp, replacement string) string {
	loc := re.FindStringSubmatchIndex(s)
	if loc == nil {
		return s
	}

	groups := make([]string, 0, len(loc)/2-1)
	for g := 1; g < len(loc)/2; g++ {
		if loc[2*g] >= 0 {
			groups = append(groups, s[loc[2*g]:loc[2*g+1]])
		} else {
			groups = append(groups, "")
		}
	}

	before, after := s[:loc[0]], s[loc[1]:]

	return before + jsExpandReplacement(replacement, s[loc[0]:loc[1]], before, after, groups) + after
}
