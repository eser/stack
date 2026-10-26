// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/parsingfx"
)

// ── Tokenizer tests ──────────────────────────────────────────────────────────

func TestTokenize_EmptyInput(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 0 {
		t.Fatalf("expected 0 tokens, got %d", len(tokens))
	}
}

func TestTokenize_Identifier(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("hello", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}

	if tokens[0].Kind != "identifier" || tokens[0].Value != "hello" {
		t.Fatalf("unexpected token: %+v", tokens[0])
	}

	if tokens[0].Offset != 0 || tokens[0].Length != 5 {
		t.Fatalf("unexpected position: offset=%d length=%d", tokens[0].Offset, tokens[0].Length)
	}
}

func TestTokenize_Integer(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("42", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 1 || tokens[0].Kind != "integer" || tokens[0].Value != "42" {
		t.Fatalf("unexpected tokens: %+v", tokens)
	}
}

func TestTokenize_Float(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("3.14", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 1 || tokens[0].Kind != "float" || tokens[0].Value != "3.14" {
		t.Fatalf("unexpected tokens: %+v", tokens)
	}
}

func TestTokenize_SimpleExpression(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("x = 1", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// x whitespace = whitespace 1
	if len(tokens) != 5 {
		t.Fatalf("expected 5 tokens, got %d: %+v", len(tokens), tokens)
	}

	if tokens[0].Kind != "identifier" {
		t.Errorf("token[0]: want identifier, got %q", tokens[0].Kind)
	}

	if tokens[2].Kind != "operator" || tokens[2].Value != "=" {
		t.Errorf("token[2]: want operator '=', got %+v", tokens[2])
	}

	if tokens[4].Kind != "integer" || tokens[4].Value != "1" {
		t.Errorf("token[4]: want integer '1', got %+v", tokens[4])
	}
}

func TestTokenize_DoubleQuotedString(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize(`"hello world"`, parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 1 || tokens[0].Kind != "string_double" {
		t.Fatalf("expected one string_double token, got %+v", tokens)
	}
}

func TestTokenize_LineComment(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("// a comment", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(tokens) != 1 || tokens[0].Kind != "line_comment" {
		t.Fatalf("expected one line_comment token, got %+v", tokens)
	}
}

func TestTokenize_UnexpectedInput(t *testing.T) {
	t.Parallel()

	// Use a definition list that only knows about integers
	defs := []parsingfx.TokenDefinition{
		{Name: "integer", Pattern: `\d+`},
	}

	_, err := parsingfx.Tokenize("123 abc", defs)
	if err == nil {
		t.Fatal("expected error for unmatched input")
	}
}

func TestTokenize_InvalidPattern(t *testing.T) {
	t.Parallel()

	defs := []parsingfx.TokenDefinition{
		{Name: "bad", Pattern: `[invalid`},
	}

	_, err := parsingfx.Tokenize("anything", defs)
	if err == nil {
		t.Fatal("expected compilation error")
	}
}

func TestTokenize_Offsets(t *testing.T) {
	t.Parallel()

	tokens, err := parsingfx.Tokenize("ab cd", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// ab(0,2) ws(2,1) cd(3,2)
	if tokens[0].Offset != 0 || tokens[0].Length != 2 {
		t.Errorf("token[0] position: %+v", tokens[0])
	}

	if tokens[1].Offset != 2 || tokens[1].Length != 1 {
		t.Errorf("token[1] position: %+v", tokens[1])
	}

	if tokens[2].Offset != 3 || tokens[2].Length != 2 {
		t.Errorf("token[2] position: %+v", tokens[2])
	}
}

// ── Combinator tests ─────────────────────────────────────────────────────────

func tokenize(t *testing.T, input string) []parsingfx.Token {
	t.Helper()

	tokens, err := parsingfx.Tokenize(input, parsingfx.SimpleTokens())
	if err != nil {
		t.Fatalf("tokenize %q: %v", input, err)
	}

	return tokens
}

func TestKind_Match(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "hello")
	r := parsingfx.Kind("identifier")(tokens)

	if !r.OK || len(r.Matched) != 1 || r.Matched[0].Value != "hello" {
		t.Fatalf("unexpected result: %+v", r)
	}

	if len(r.Rest) != 0 {
		t.Fatalf("expected empty rest, got %+v", r.Rest)
	}
}

func TestKind_NoMatch(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "hello")
	r := parsingfx.Kind("integer")(tokens)

	if r.OK {
		t.Fatal("expected no match")
	}
}

func TestSequence_AllMatch(t *testing.T) {
	t.Parallel()

	// Tokenize "x=1" → identifier operator integer
	tokens := tokenize(t, "x=1")
	r := parsingfx.Sequence(
		parsingfx.Kind("identifier"),
		parsingfx.Kind("operator"),
		parsingfx.Kind("integer"),
	)(tokens)

	if !r.OK {
		t.Fatal("expected sequence to match")
	}

	if len(r.Matched) != 3 {
		t.Fatalf("expected 3 matched tokens, got %d", len(r.Matched))
	}
}

func TestSequence_PartialFail(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "x+")
	r := parsingfx.Sequence(
		parsingfx.Kind("identifier"),
		parsingfx.Kind("integer"), // mismatch — operator present, not integer
	)(tokens)

	if r.OK {
		t.Fatal("expected sequence to fail")
	}

	// Rest should be the original tokens (nothing consumed on failure)
	if len(r.Rest) != len(tokens) {
		t.Fatalf("sequence should restore rest on failure; got %d tokens", len(r.Rest))
	}
}

func TestOneOf_FirstMatch(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "hello")
	r := parsingfx.OneOf(
		parsingfx.Kind("integer"),
		parsingfx.Kind("identifier"),
	)(tokens)

	if !r.OK || r.Matched[0].Kind != "identifier" {
		t.Fatalf("expected identifier match: %+v", r)
	}
}

func TestOptional_NoMatch(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "hello")
	r := parsingfx.Optional(parsingfx.Kind("integer"))(tokens)

	if !r.OK {
		t.Fatal("optional should always succeed")
	}

	if len(r.Matched) != 0 {
		t.Fatalf("expected no tokens consumed, got %d", len(r.Matched))
	}
}

func TestRepeat_MultipleMatches(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "123")
	r := parsingfx.Repeat(parsingfx.Kind("integer"))(tokens)

	if !r.OK || len(r.Matched) != 1 {
		t.Fatalf("expected 1 integer: %+v", r)
	}
}

func TestNot_Inverts(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "hello")

	// Not(integer) should succeed because head is identifier, not integer
	r := parsingfx.Not(parsingfx.Kind("integer"))(tokens)
	if !r.OK {
		t.Fatal("Not(integer) on identifier should succeed")
	}

	// Not(identifier) should fail
	r2 := parsingfx.Not(parsingfx.Kind("identifier"))(tokens)
	if r2.OK {
		t.Fatal("Not(identifier) on identifier should fail")
	}
}

func TestSkipWhitespace(t *testing.T) {
	t.Parallel()

	tokens := tokenize(t, "  hello")
	r := parsingfx.SkipWhitespace(parsingfx.Kind("identifier"))(tokens)

	if !r.OK || r.Matched[0].Value != "hello" {
		t.Fatalf("expected identifier after skipping whitespace: %+v", r)
	}
}
