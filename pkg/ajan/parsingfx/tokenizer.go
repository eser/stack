// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx

import (
	"fmt"
	"regexp"
	"strings"
)

// compiledDefinition is the internal runtime form of a TokenDefinition, with
// the pattern pre-compiled and anchored to the beginning of the input.
type compiledDefinition struct {
	name    string
	pattern *regexp.Regexp
}

// compileDefinitions converts []TokenDefinition to []compiledDefinition.
// Each pattern is anchored with ^ so that regexp.FindString always tries to
// match at the current cursor position only.
func compileDefinitions(defs []TokenDefinition) ([]compiledDefinition, error) {
	out := make([]compiledDefinition, len(defs))

	for i, d := range defs {
		p := d.Pattern
		if !strings.HasPrefix(p, "^") {
			p = "^(?:" + p + ")"
		}

		re, err := regexp.Compile(p)
		if err != nil {
			return nil, fmt.Errorf("TokenDefinition %q: %w: %w", d.Name, ErrInvalidPattern, err)
		}

		out[i] = compiledDefinition{name: d.Name, pattern: re}
	}

	return out, nil
}

// Tokenize splits input into a sequence of Tokens by applying defs left-to-right,
// greedy first-match at each cursor position.
//
// If no definition matches at the current position, ErrUnexpectedInput is returned
// together with all tokens produced so far so that callers can show context.
func Tokenize(input string, defs []TokenDefinition) ([]Token, error) {
	compiled, err := compileDefinitions(defs)
	if err != nil {
		return nil, err
	}

	var tokens []Token
	offset := 0

	for offset < len(input) {
		remaining := input[offset:]
		matched := false

		for _, cd := range compiled {
			loc := cd.pattern.FindStringIndex(remaining)
			if loc == nil || loc[0] != 0 {
				continue
			}

			value := remaining[loc[0]:loc[1]]
			tokens = append(tokens, Token{
				Kind:   cd.name,
				Value:  value,
				Offset: offset,
				Length: loc[1] - loc[0],
			})

			offset += loc[1]
			matched = true

			break
		}

		if !matched {
			return tokens, fmt.Errorf("offset %d %q: %w", offset, remaining[:min(10, len(remaining))], ErrUnexpectedInput)
		}
	}

	return tokens, nil
}

// SimpleTokens returns a set of built-in TokenDefinitions covering common
// lexical categories: whitespace, line endings, identifiers, integers, floats,
// single- and double-quoted strings, comments, and punctuation/operators.
//
// The definitions are ordered from most-specific to least-specific so that
// greedy first-match gives predictable results.
func SimpleTokens() []TokenDefinition {
	return []TokenDefinition{
		// Whitespace (spaces and tabs — not newlines)
		{Name: "whitespace", Pattern: `[ \t]+`},
		// Newlines (standalone so they can be tracked for line counting)
		{Name: "newline", Pattern: `\r?\n`},
		// Line comment // …
		{Name: "line_comment", Pattern: `//[^\n]*`},
		// Block comment /* … */
		{Name: "block_comment", Pattern: `/\*[\s\S]*?\*/`},
		// Double-quoted string with escape sequences
		{Name: "string_double", Pattern: `"(?:[^"\\]|\\.)*"`},
		// Single-quoted string with escape sequences
		{Name: "string_single", Pattern: `'(?:[^'\\]|\\.)*'`},
		// Backtick template literal (no expression interpolation — just the raw text)
		{Name: "string_template", Pattern: "`(?:[^`\\\\]|\\\\.)*`"},
		// Floating-point number (must come before integer)
		{Name: "float", Pattern: `\d+\.\d+(?:[eE][+-]?\d+)?`},
		// Integer (decimal, hex, octal, binary)
		{Name: "integer", Pattern: `0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+`},
		// Identifier or keyword
		{Name: "identifier", Pattern: `[a-zA-Z_$][a-zA-Z0-9_$]*`},
		// Three-character operators
		{Name: "op3", Pattern: `===|!==|>>>|<<=|>>=|\*\*=`},
		// Two-character operators
		{Name: "op2", Pattern: `==|!=|<=|>=|&&|\|\||<<|>>|\+\+|--|->|\+=|-=|\*=|/=|%=|&=|\|=|\^=|\?\?|::`},
		// Arithmetic and comparison operators
		{Name: "operator", Pattern: `[+\-*/%<>=!&|^~?]`},
		// Brackets and grouping
		{Name: "lparen", Pattern: `\(`},
		{Name: "rparen", Pattern: `\)`},
		{Name: "lbracket", Pattern: `\[`},
		{Name: "rbracket", Pattern: `\]`},
		{Name: "lbrace", Pattern: `\{`},
		{Name: "rbrace", Pattern: `\}`},
		// Punctuation
		{Name: "semicolon", Pattern: `;`},
		{Name: "colon", Pattern: `:`},
		{Name: "comma", Pattern: `,`},
		{Name: "dot", Pattern: `\.`},
		{Name: "at", Pattern: `@`},
		{Name: "hash", Pattern: `#`},
		{Name: "backslash", Pattern: `\\`},
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}

	return b
}
