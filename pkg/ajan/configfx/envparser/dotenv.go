// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package envparser

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// The .env dialect of @eserstack/config/dotenv, which took it from @std/dotenv
// 0.225 (MIT, the Deno authors): ParseDotenv answers what that library's
// parse answered, so the TypeScript library delegates to it through the
// bridge. ParseBytes keeps the Go loader's own dialect (dotted keys, a colon
// separator, a "#" that starts a comment only after a space), which configfx
// uses to fill structs.
//
// The patterns are @std/dotenv's JavaScript expressions in RE2 syntax. RE2
// picks the match a backtracking engine picks (leftmost-first), so the lazy
// and greedy parts behave the same. JavaScript's \s, ".", "^" and "$" differ
// from RE2's, so they are spelled out: jsSpace is the class of JavaScript's \s
// and String.prototype.trim, jsDot is "." without the s flag, the line starts
// that "^" accepts in multiline mode are found by hand, and the final "$"
// always holds right after the greedy jsDot run that precedes it.
const (
	jsSpace = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`
	jsDot   = `[^\n\r\x{2028}\x{2029}]`
)

var (
	//nolint:gochecknoglobals // compiled once
	dotenvLinePattern = regexp.MustCompile(`\A[` + jsSpace + `]*(?:export[` + jsSpace + `]+)?` +
		`(?P<key>[^` + jsSpace + `=#]+?)[` + jsSpace + `]*=[ \t]*` +
		`(?:'\r?\n?(?P<single>(?:` + jsDot + `|\r\n|\n)*?)\r?\n?'` +
		`|"\r?\n?(?P<double>(?:[^"\\]|\\[\s\S])*?)\r?\n?"` +
		`|(?P<unquoted>[^\r\n#]*)) *#*` + jsDot + `*`)

	//nolint:gochecknoglobals // compiled once
	dotenvValidKeyPattern = regexp.MustCompile(`\A[a-zA-Z_][a-zA-Z0-9_]*\z`)

	//nolint:gochecknoglobals // compiled once
	dotenvBracedPattern = regexp.MustCompile(`\A\$\{(?P<name>` + jsDot + `+?)(?::-(?P<fallback>` + jsDot + `+))?\}`)

	//nolint:gochecknoglobals // compiled once
	dotenvBarePattern = regexp.MustCompile(`\A\$(?P<name>\w+)(?::-(?P<fallback>` + jsDot + `+))?`)

	//nolint:gochecknoglobals // a lookup table
	dotenvEscapes = map[byte]byte{
		'n':  '\n',
		'r':  '\r',
		't':  '\t',
		'"':  '"',
		'\'': '\'',
		'\\': '\\',
	}

	//nolint:gochecknoglobals // submatch indexes, resolved once
	lineGroups = struct{ key, single, double, unquoted int }{
		key:      dotenvLinePattern.SubexpIndex("key"),
		single:   dotenvLinePattern.SubexpIndex("single"),
		double:   dotenvLinePattern.SubexpIndex("double"),
		unquoted: dotenvLinePattern.SubexpIndex("unquoted"),
	}
)

// dotenvMaxExpandPasses bounds the expansion of a value whose references
// expand to more references; a value that refers to itself stops there.
const dotenvMaxExpandPasses = 10

// LookupFunc resolves a name the file does not set, such as a variable of the
// process environment, and reports whether it is set.
type LookupFunc func(name string) (string, bool)

// DotenvEntry is one variable that ParseDotenv read.
type DotenvEntry struct {
	Key   string
	Value string
}

// DotenvResult is what ParseDotenv read from a file.
type DotenvResult struct {
	// Entries are the variables, each at the position where its key first
	// appears; a later line of the same key changes the value only.
	Entries []DotenvEntry
	// Ignored are the keys skipped because they are not identifiers, in the
	// order they appear.
	Ignored []string
}

// orderedValues keeps values by key in the order the keys were first set.
type orderedValues struct {
	index   map[string]int
	entries []DotenvEntry
}

func newOrderedValues() *orderedValues {
	return &orderedValues{index: map[string]int{}, entries: nil}
}

func (o *orderedValues) set(key, value string) {
	if i, ok := o.index[key]; ok {
		o.entries[i].Value = value

		return
	}

	o.index[key] = len(o.entries)
	o.entries = append(o.entries, DotenvEntry{Key: key, Value: value})
}

func (o *orderedValues) get(key string) (string, bool) {
	i, ok := o.index[key]
	if !ok {
		return "", false
	}

	return o.entries[i].Value, true
}

// ParseDotenv reads .env text in the dialect of @eserstack/config/dotenv.
//
// Single-quoted values stay as written, double-quoted values unescape \n,
// \r, \t, \", \' and \\, and unquoted values expand ${NAME}, $NAME,
// ${NAME:-default} and $NAME:-default. A name resolves to the file's value as
// written, then to lookup, then to its default, then to "". A key that is not
// an identifier is skipped and listed in Ignored. lookup may be nil.
func ParseDotenv(text string, lookup LookupFunc) DotenvResult {
	values := newOrderedValues()

	var (
		ignored  []string
		toExpand []string
	)

	end := 0

	for _, start := range lineStarts(text) {
		if start < end {
			continue
		}

		loc := dotenvLinePattern.FindStringSubmatchIndex(text[start:])
		if loc == nil {
			continue
		}

		end = start + loc[1]
		group := func(n int) (string, bool) {
			if loc[2*n] < 0 {
				return "", false
			}

			return text[start+loc[2*n] : start+loc[2*n+1]], true
		}

		key, _ := group(lineGroups.key)
		if !dotenvValidKeyPattern.MatchString(key) {
			ignored = append(ignored, key)

			continue
		}

		if single, ok := group(lineGroups.single); ok {
			values.set(key, single)

			continue
		}

		if double, ok := group(lineGroups.double); ok {
			values.set(key, unescapeDotenv(double))

			continue
		}

		unquoted, _ := group(lineGroups.unquoted)
		values.set(key, strings.TrimFunc(unquoted, isJSSpace))

		// Every unquoted line of a key expands the key's final value once,
		// as @std/dotenv does, so a key that repeats expands again.
		if unquoted != "" {
			toExpand = append(toExpand, key)
		}
	}

	// References resolve against the values as written, before any of
	// them expands.
	written := newOrderedValues()
	for _, entry := range values.entries {
		written.set(entry.Key, entry.Value)
	}

	for _, key := range toExpand {
		value, _ := values.get(key)
		values.set(key, expandDotenv(value, written, lookup))
	}

	return DotenvResult{Entries: values.entries, Ignored: ignored}
}

// lineStarts returns the offsets where a JavaScript multiline "^" holds: the
// start of the text and every offset right after a line terminator.
func lineStarts(text string) []int {
	starts := []int{0}

	for i, r := range text {
		switch r {
		case '\n', '\r', '\u2028', '\u2029':
			starts = append(starts, i+utf8.RuneLen(r))
		}
	}

	return starts
}

func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680', '\u2028', '\u2029',
		'\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	}

	return r >= '\u2000' && r <= '\u200a'
}

// unescapeDotenv applies the escapes of a double-quoted value; any other
// backslash pair stays as written.
func unescapeDotenv(value string) string {
	if !strings.Contains(value, `\`) {
		return value
	}

	var out strings.Builder

	out.Grow(len(value))

	for i := 0; i < len(value); i++ {
		if value[i] != '\\' || i+1 == len(value) {
			out.WriteByte(value[i])

			continue
		}

		if replacement, ok := dotenvEscapes[value[i+1]]; ok {
			out.WriteByte(replacement)
			i++

			continue
		}

		_, size := utf8.DecodeRuneInString(value[i+1:])
		out.WriteString(value[i : i+1+size])
		i += size
	}

	return out.String()
}

// expandDotenv expands the references of value, again while a pass changes
// it, up to dotenvMaxExpandPasses passes.
func expandDotenv(value string, written *orderedValues, lookup LookupFunc) string {
	current := value

	for range dotenvMaxExpandPasses {
		next := expandDotenvOnce(current, written, lookup)
		if next == current {
			break
		}

		current = next
	}

	return current
}

// expandDotenvOnce is one pass of @std/dotenv's replace: from left to right,
// a braced reference, else a bare one that no backslash precedes.
func expandDotenvOnce(value string, written *orderedValues, lookup LookupFunc) string {
	if !strings.Contains(value, "$") {
		return value
	}

	var out strings.Builder

	for i := 0; i < len(value); {
		if value[i] != '$' {
			out.WriteByte(value[i])
			i++

			continue
		}

		pattern := dotenvBracedPattern

		loc := pattern.FindStringSubmatchIndex(value[i:])
		if loc == nil && (i == 0 || value[i-1] != '\\') {
			pattern = dotenvBarePattern
			loc = pattern.FindStringSubmatchIndex(value[i:])
		}

		if loc == nil {
			out.WriteByte('$')
			i++

			continue
		}

		name := value[i+loc[2] : i+loc[3]]
		fallback, hasFallback := "", loc[4] >= 0

		if hasFallback {
			fallback = value[i+loc[4] : i+loc[5]]
		}

		out.WriteString(resolveDotenvName(name, fallback, hasFallback, written, lookup))
		i += loc[1]
	}

	return out.String()
}

func resolveDotenvName(
	name, fallback string,
	hasFallback bool,
	written *orderedValues,
	lookup LookupFunc,
) string {
	if value, ok := written.get(name); ok {
		return value
	}

	if lookup != nil {
		if value, ok := lookup(name); ok {
			return value
		}
	}

	if hasFallback {
		return fallback
	}

	return ""
}
