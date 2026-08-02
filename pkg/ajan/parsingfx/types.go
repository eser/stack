// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx

// Token represents a single matched token from the input string.
type Token struct {
	// Kind is the name of the TokenDefinition that produced this token.
	Kind string `json:"kind"`
	// Value is the raw matched text.
	Value string `json:"value"`
	// Offset is the byte offset in the source string where the token starts.
	Offset int `json:"offset"`
	// Length is the byte length of the matched text.
	Length int `json:"length"`
}

// TokenDefinition describes a named token type with a regex pattern.
// Definitions are tested in order; the first match at the current position wins.
type TokenDefinition struct {
	// Name is the token kind name emitted on a match.
	Name string `json:"name"`
	// Pattern is the regex pattern. It is automatically anchored at the left (^)
	// if not already, so it always matches at the current cursor position.
	Pattern string `json:"pattern"`
}

// ParseResult holds the output of a tokenization call.
type ParseResult struct {
	Tokens []Token `json:"tokens"`
}

// MatchResult is the output of a combinator applied to a token slice.
type MatchResult struct {
	// Matched contains the tokens consumed by the combinator.
	Matched []Token
	// Rest contains the remaining tokens not yet consumed.
	Rest []Token
	// OK is false when the combinator could not match.
	OK bool
}
