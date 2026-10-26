// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
)

// The regular expression pieces of a POSIX glob, as @std/path's globToRegExp
// builds them.
const (
	globSep      = "/+"
	globSepMaybe = "/*"
	globStar     = "(?:[^/]*(?:/|$)+)*"
	globWildcard = "[^/]*"
)

var (
	globEscapeChars  = []rune{'!', '$', '(', ')', '*', '+', '.', '=', '?', '[', '\\', '^', '{', '|'}
	rangeEscapeChars = []rune{'-', '\\', ']'}

	posixClasses = map[string]string{
		"alnum":  `\dA-Za-z`,
		"alpha":  `A-Za-z`,
		"ascii":  `\x00-\x7F`,
		"blank":  `\t `,
		"cntrl":  `\x00-\x1F\x7F`,
		"digit":  `\d`,
		"graph":  `\x21-\x7E`,
		"lower":  `a-z`,
		"print":  `\x20-\x7E`,
		"punct":  `!"#$%&'()*+,\-./:;<=>?@\[\\\]^_‘{|}~`,
		"space":  `\s\v`,
		"upper":  `A-Z`,
		"word":   `\w`,
		"xdigit": `\dA-Fa-f`,
	}
)

const braceGroup = "BRACE"

func escapeGlobRune(r rune, chars []rune) string {
	if slices.Contains(chars, r) {
		return `\` + string(r)
	}

	return string(r)
}

// GlobToRegexp converts a POSIX glob to a regular expression the way
// @std/path's globToRegExp does with extended and globstar on: `*` stays in
// one path segment, `**` as a whole segment spans segments, `?` is one
// character, and `[...]`, `[!...]`, `[[:class:]]`, `{a,b}`, `?(a|b)`,
// `@(a|b)`, `*(a|b)` and `+(a|b)` work. `!(a|b)` needs a lookahead, which Go's
// regexp lacks, so its segment is matched literally. A segment with an
// unclosed group is matched literally too, and an empty glob matches nothing.
func GlobToRegexp(glob string) (*regexp.Regexp, error) {
	if glob == "" {
		return regexp.MustCompile(`^\b\B$`), nil // matches nothing
	}

	runes := []rune(strings.TrimRight(glob, "/"))
	if len(runes) == 0 {
		runes = []rune{'/'}
	}

	at := func(i int) rune {
		if i < 0 || i >= len(runes) {
			return 0
		}

		return runes[i]
	}

	var expr strings.Builder

	for j := 0; j < len(runes); {
		var segment strings.Builder

		var groups []string

		inRange, inEscape, endsWithSep, literal := false, false, false, false
		i := j

		for ; i < len(runes) && (runes[i] != '/' || len(groups) > 0); i++ {
			r := runes[i]

			switch {
			case inEscape:
				inEscape = false

				chars := globEscapeChars
				if inRange {
					chars = rangeEscapeChars
				}

				segment.WriteString(escapeGlobRune(r, chars))
			case r == '\\':
				inEscape = true
			case r == '[' && !inRange:
				inRange = true

				segment.WriteString("[")

				switch at(i + 1) {
				case '!':
					i++

					segment.WriteString("^")
				case '^':
					i++

					segment.WriteString(`\^`)
				}
			case r == '[' && at(i+1) == ':':
				k := i + 1
				name := ""

				for at(k+1) != 0 && at(k+1) != ':' {
					name += string(at(k + 1))
					k++
				}

				if at(k+1) == ':' && at(k+2) == ']' {
					i = k + 2
					segment.WriteString(posixClasses[name])
				} else {
					segment.WriteString(string(r))
				}
			case r == ']' && inRange:
				inRange = false

				segment.WriteString("]")
			case inRange:
				segment.WriteString(string(r))
			case r == ')' && len(groups) > 0 && groups[len(groups)-1] != braceGroup:
				segment.WriteString(")")

				kind := groups[len(groups)-1]
				groups = groups[:len(groups)-1]

				if kind != "@" {
					segment.WriteString(kind)
				}
			case r == '|' && len(groups) > 0 && groups[len(groups)-1] != braceGroup:
				segment.WriteString("|")
			case (r == '+' || r == '@') && at(i+1) == '(':
				i++

				groups = append(groups, string(r))

				segment.WriteString("(?:")
			case r == '!' && at(i+1) == '(':
				literal = true
			case r == '?':
				if at(i+1) == '(' {
					i++

					groups = append(groups, "?")

					segment.WriteString("(?:")
				} else {
					segment.WriteString(".")
				}
			case r == '{':
				groups = append(groups, braceGroup)

				segment.WriteString("(?:")
			case r == '}' && len(groups) > 0 && groups[len(groups)-1] == braceGroup:
				groups = groups[:len(groups)-1]

				segment.WriteString(")")
			case r == ',' && len(groups) > 0 && groups[len(groups)-1] == braceGroup:
				segment.WriteString("|")
			case r == '*':
				if at(i+1) == '(' {
					i++

					groups = append(groups, "*")

					segment.WriteString("(?:")

					continue
				}

				prev := at(i - 1)
				stars := 1

				for at(i+1) == '*' {
					i++
					stars++
				}

				next := at(i + 1)
				if stars == 2 && (prev == '/' || prev == 0) && (next == '/' || next == 0) {
					segment.WriteString(globStar)

					endsWithSep = true
				} else {
					segment.WriteString(globWildcard)
				}
			default:
				segment.WriteString(escapeGlobRune(r, globEscapeChars))
			}
		}

		if len(groups) > 0 || inRange || inEscape || literal {
			segment.Reset()

			for _, r := range runes[j:i] {
				segment.WriteString(escapeGlobRune(r, globEscapeChars))
			}

			endsWithSep = false
		}

		expr.WriteString(segment.String())

		if !endsWithSep {
			if i < len(runes) {
				expr.WriteString(globSep)
			} else {
				expr.WriteString(globSepMaybe)
			}
		}

		for i < len(runes) && runes[i] == '/' {
			i++
		}

		j = i
	}

	pattern, err := regexp.Compile("^" + expr.String() + "$")
	if err != nil {
		return nil, fmt.Errorf("compile glob %q: %w", glob, err)
	}

	return pattern, nil
}

// ShouldIgnore reports whether relativePath (with "/" separators) matches one
// of the patterns: through GlobToRegexp, or, for a pattern without `*` or
// `?`, as that path or a directory above it ("docs" and "docs/" also match
// "docs/a.md"). A pattern that does not compile matches nothing.
func ShouldIgnore(relativePath string, patterns []string) bool {
	for _, pattern := range patterns {
		if expr, err := GlobToRegexp(pattern); err == nil && expr.MatchString(relativePath) {
			return true
		}

		if !strings.ContainsAny(pattern, "*?") {
			if relativePath == pattern || strings.HasPrefix(relativePath, strings.TrimSuffix(pattern, "/")+"/") {
				return true
			}
		}
	}

	return false
}
