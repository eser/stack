// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf16"
)

// The hook checks were written against JavaScript's string and regular
// expression semantics, and the port keeps them: a command the TypeScript
// guard refuses must be refused here too. These helpers give Go the parts
// that differ, chiefly what counts as whitespace.

// jsSpaceClass is the character class of JavaScript's \s: the ECMAScript
// WhiteSpace and LineTerminator code points. Go's \s holds only ASCII space,
// \t, \n, \f and \r.
const jsSpaceClass = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// jsSpace and jsNonSpace stand for JavaScript's \s and \S inside a Go
// regular expression.
const (
	jsSpace    = `[` + jsSpaceClass + `]`
	jsNonSpace = `[^` + jsSpaceClass + `]`
)

// jsWhitespaceRun is /\s+/ as JavaScript reads it.
var jsWhitespaceRun = regexp.MustCompile(jsSpace + `+`) //nolint:gochecknoglobals // compiled once, read-only

// isJSSpace reports whether r is in JavaScript's \s.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}

	return r >= 0x2000 && r <= 0x200a
}

// isJSLineTerminator reports whether r ends a line for JavaScript's `.`, `^`
// and `$` in multiline mode.
func isJSLineTerminator(r rune) bool {
	return r == '\n' || r == '\r' || r == 0x2028 || r == 0x2029
}

// jsTrim is String.prototype.trim.
func jsTrim(s string) string {
	return strings.TrimFunc(s, isJSSpace)
}

// jsSplit is String.prototype.split with a regular expression that never
// matches the empty string: "" gives [""], and separators at the ends give
// empty first and last parts.
func jsSplit(s string, separator *regexp.Regexp) []string {
	return separator.Split(s, -1)
}

// jsSplitWhitespace is `s.split(/\s+/)`.
func jsSplitWhitespace(s string) []string {
	return jsSplit(s, jsWhitespaceRun)
}

// jsLines splits text at JavaScript's line terminators, so a multiline
// pattern can run on each line with `^` and `$` meaning its ends.
func jsLines(text string) []string {
	return strings.FieldsFunc(text, isJSLineTerminator)
}

// jsLength is String.prototype.length: the UTF-16 code units of s.
func jsLength(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}

	return n
}

// jsToLower is String.prototype.toLowerCase where Go's strings.ToLower
// differs: U+0130 lowercases to "i" and a combining dot, and a capital sigma
// at the end of a word becomes the final sigma ς.
func jsToLower(s string) string {
	if !strings.ContainsAny(s, "\u0130\u03a3") {
		return strings.ToLower(s)
	}

	runes := []rune(s)

	var b strings.Builder

	for i, r := range runes {
		switch {
		case r == '\u0130':
			b.WriteString("i\u0307")
		case r == '\u03a3' && isFinalSigma(runes, i):
			b.WriteRune('\u03c2')
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}

	return b.String()
}

// isFinalSigma is the Unicode Final_Sigma condition: a cased letter comes
// before the sigma and none after it, skipping case-ignorable characters.
func isFinalSigma(runes []rune, at int) bool {
	before := false

	for i := at - 1; i >= 0; i-- {
		if isCaseIgnorable(runes[i]) {
			continue
		}

		before = isCased(runes[i])

		break
	}

	if !before {
		return false
	}

	for i := at + 1; i < len(runes); i++ {
		if isCaseIgnorable(runes[i]) {
			continue
		}

		return !isCased(runes[i])
	}

	return true
}

func isCased(r rune) bool {
	return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r)
}

func isCaseIgnorable(r rune) bool {
	switch r {
	case '\'', '.', ':', '\u00b7', '\u2018', '\u2019', '\u2024', '\u2027', '\u02bc':
		return true
	}

	return unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk)
}

// jsFirstSegment is `s.split(set)[0]`: the text before the first byte of s
// that is in set.
func jsFirstSegment(s, set string) string {
	if i := strings.IndexAny(s, set); i >= 0 {
		return s[:i]
	}

	return s
}

// jsLastPathPart is `s.split(sep).pop()` for a separator of one or more
// characters given as a set.
func jsLastPathPart(s, set string) string {
	if i := strings.LastIndexAny(s, set); i >= 0 {
		return s[i+1:]
	}

	return s
}
