// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/parsingfx"
)

// ─── KindValue ────────────────────────────────────────────────────────────────

func TestKindValue_Match(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "op", Value: "+"},
	}

	got := parsingfx.KindValue("op", "+")(tokens)
	if !got.OK {
		t.Fatal("KindValue should match token with correct kind and value")
	}
	if len(got.Matched) != 1 {
		t.Errorf("expected 1 matched token, got %d", len(got.Matched))
	}
}

func TestKindValue_WrongValue(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "op", Value: "+"},
	}

	got := parsingfx.KindValue("op", "-")(tokens)
	if got.OK {
		t.Fatal("KindValue should fail when value does not match")
	}
}

func TestKindValue_WrongKind(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "identifier", Value: "x"},
	}

	got := parsingfx.KindValue("op", "x")(tokens)
	if got.OK {
		t.Fatal("KindValue should fail when kind does not match")
	}
}

func TestKindValue_EmptyTokens(t *testing.T) {
	t.Parallel()

	got := parsingfx.KindValue("op", "+")(nil)
	if got.OK {
		t.Fatal("KindValue on empty tokens should fail")
	}
}

// ─── AnyToken ─────────────────────────────────────────────────────────────────

func TestAnyToken_Matches(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "identifier", Value: "foo"},
		{Kind: "op", Value: "+"},
	}

	got := parsingfx.AnyToken()(tokens)
	if !got.OK {
		t.Fatal("AnyToken should match first token")
	}
	if len(got.Matched) != 1 {
		t.Errorf("expected 1 matched token, got %d", len(got.Matched))
	}
	if len(got.Rest) != 1 {
		t.Errorf("expected 1 remaining token, got %d", len(got.Rest))
	}
}

func TestAnyToken_EmptyTokens(t *testing.T) {
	t.Parallel()

	got := parsingfx.AnyToken()(nil)
	if got.OK {
		t.Fatal("AnyToken on empty tokens should fail")
	}
}

// ─── RepeatMin ────────────────────────────────────────────────────────────────

func TestRepeatMin_MeetsMin(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "integer", Value: "1"},
		{Kind: "integer", Value: "2"},
		{Kind: "integer", Value: "3"},
	}

	got := parsingfx.RepeatMin(parsingfx.Kind("integer"), 2)(tokens)
	if !got.OK {
		t.Fatal("RepeatMin(2) should succeed when 3 integers present")
	}
	if len(got.Matched) != 3 {
		t.Errorf("expected 3 matched tokens, got %d", len(got.Matched))
	}
}

func TestRepeatMin_BelowMin_Fails(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "integer", Value: "1"},
	}

	got := parsingfx.RepeatMin(parsingfx.Kind("integer"), 3)(tokens)
	if got.OK {
		t.Fatal("RepeatMin(3) should fail when only 1 integer present")
	}
	if len(got.Rest) != len(tokens) {
		t.Errorf("on failure, Rest should equal input: got %d want %d", len(got.Rest), len(tokens))
	}
}

func TestRepeatMin_ZeroMin_AlwaysSucceeds(t *testing.T) {
	t.Parallel()

	got := parsingfx.RepeatMin(parsingfx.Kind("identifier"), 0)(nil)
	if !got.OK {
		t.Fatal("RepeatMin(0) should always succeed, even on empty input")
	}
}

func TestRepeatMin_ExactMin(t *testing.T) {
	t.Parallel()

	tokens := []parsingfx.Token{
		{Kind: "op", Value: "+"},
		{Kind: "op", Value: "+"},
	}

	got := parsingfx.RepeatMin(parsingfx.Kind("op"), 2)(tokens)
	if !got.OK {
		t.Fatal("RepeatMin(2) should succeed when exactly 2 tokens match")
	}
}
