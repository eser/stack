// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package parsingfx provides a simple tokenizer and a set of token-level
// parser combinators. It mirrors the @eserstack/parsing TypeScript package's
// portable, language-agnostic subset.
//
// Typical usage:
//
//	tokens, err := parsingfx.Tokenize(input, parsingfx.SimpleTokens())
//	result := parsingfx.Sequence(
//	    parsingfx.Token("identifier"),
//	    parsingfx.Token("op2"),
//	    parsingfx.Token("integer"),
//	)(tokens)
package parsingfx

// Combinator is a function that consumes zero or more tokens from the front of
// a slice and returns a MatchResult describing what was consumed.
type Combinator func(tokens []Token) MatchResult

// Kind returns a Combinator that matches exactly one token of the given kind.
func Kind(kind string) Combinator {
	return func(tokens []Token) MatchResult {
		if len(tokens) == 0 || tokens[0].Kind != kind {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: tokens[:1], Rest: tokens[1:]}
	}
}

// KindValue returns a Combinator that matches one token of the given kind
// whose value equals value.
func KindValue(kind, value string) Combinator {
	return func(tokens []Token) MatchResult {
		if len(tokens) == 0 || tokens[0].Kind != kind || tokens[0].Value != value {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: tokens[:1], Rest: tokens[1:]}
	}
}

// AnyToken returns a Combinator that matches any single token regardless of kind.
func AnyToken() Combinator {
	return func(tokens []Token) MatchResult {
		if len(tokens) == 0 {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: tokens[:1], Rest: tokens[1:]}
	}
}

// Sequence returns a Combinator that matches each sub-combinator in order.
// All must succeed; if any fails the whole sequence fails with no tokens consumed.
func Sequence(combinators ...Combinator) Combinator {
	return func(tokens []Token) MatchResult {
		var matched []Token
		remaining := tokens

		for _, c := range combinators {
			r := c(remaining)
			if !r.OK {
				return MatchResult{OK: false, Rest: tokens}
			}

			matched = append(matched, r.Matched...)
			remaining = r.Rest
		}

		return MatchResult{OK: true, Matched: matched, Rest: remaining}
	}
}

// OneOf returns a Combinator that tries each alternative in order and returns
// the result of the first one that succeeds. If none succeed, it fails.
func OneOf(combinators ...Combinator) Combinator {
	return func(tokens []Token) MatchResult {
		for _, c := range combinators {
			r := c(tokens)
			if r.OK {
				return r
			}
		}

		return MatchResult{OK: false, Rest: tokens}
	}
}

// Optional wraps a Combinator so that it always succeeds, consuming tokens only
// when the inner combinator matches.
func Optional(c Combinator) Combinator {
	return func(tokens []Token) MatchResult {
		r := c(tokens)
		if r.OK {
			return r
		}

		return MatchResult{OK: true, Matched: nil, Rest: tokens}
	}
}

// Repeat returns a Combinator that applies c as many times as possible (zero or
// more), collecting all matched tokens. It always succeeds.
func Repeat(c Combinator) Combinator {
	return func(tokens []Token) MatchResult {
		var matched []Token
		remaining := tokens

		for {
			r := c(remaining)
			if !r.OK {
				break
			}

			matched = append(matched, r.Matched...)
			remaining = r.Rest

			if len(r.Matched) == 0 {
				// Guard against infinite loops from zero-width combinators.
				break
			}
		}

		return MatchResult{OK: true, Matched: matched, Rest: remaining}
	}
}

// RepeatMin returns a Combinator like Repeat but requires at least min matches.
func RepeatMin(c Combinator, minCount int) Combinator {
	return func(tokens []Token) MatchResult {
		var matched []Token
		remaining := tokens

		for {
			r := c(remaining)
			if !r.OK {
				break
			}

			matched = append(matched, r.Matched...)
			remaining = r.Rest

			if len(r.Matched) == 0 {
				break
			}
		}

		if len(matched) < minCount {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: matched, Rest: remaining}
	}
}

// Not returns a Combinator that succeeds (consuming no tokens) only when c
// would fail on the current input. It never consumes tokens.
func Not(c Combinator) Combinator {
	return func(tokens []Token) MatchResult {
		r := c(tokens)
		if r.OK {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: nil, Rest: tokens}
	}
}

// Skip returns a Combinator like Token but discards the matched token from
// Matched (useful for consuming delimiters without including them in output).
func Skip(kind string) Combinator {
	return func(tokens []Token) MatchResult {
		if len(tokens) == 0 || tokens[0].Kind != kind {
			return MatchResult{OK: false, Rest: tokens}
		}

		return MatchResult{OK: true, Matched: nil, Rest: tokens[1:]}
	}
}

// SkipWhitespace returns a Combinator that skips any leading whitespace and
// newline tokens, then applies c.
func SkipWhitespace(c Combinator) Combinator {
	skipWS := Repeat(OneOf(Skip("whitespace"), Skip("newline")))

	return func(tokens []Token) MatchResult {
		r := skipWS(tokens)

		return c(r.Rest)
	}
}
