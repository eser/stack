// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx_test

import (
	"context"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/parsingfx"
)

// ─── Tokenizer struct ────────────────────────────────────────────────────────

func TestTokenizer_SingleChunk_MatchesBatchTokenize(t *testing.T) {
	t.Parallel()

	tok, err := parsingfx.NewTokenizer(parsingfx.SimpleTokens())
	if err != nil {
		t.Fatal(err)
	}

	pushed, err := tok.Push("foo + bar")
	if err != nil {
		t.Fatal(err)
	}

	flushed, err := tok.Flush()
	if err != nil {
		t.Fatal(err)
	}

	all := make([]parsingfx.Token, 0, len(pushed)+len(flushed))
	all = append(all, pushed...)
	all = append(all, flushed...)

	expected, err := parsingfx.Tokenize("foo + bar", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatal(err)
	}

	if len(all) != len(expected) {
		t.Fatalf("streaming: %d tokens, batch: %d tokens", len(all), len(expected))
	}

	for i := range expected {
		if all[i].Kind != expected[i].Kind || all[i].Value != expected[i].Value {
			t.Errorf("[%d] got {%s %q}, want {%s %q}", i, all[i].Kind, all[i].Value, expected[i].Kind, expected[i].Value)
		}
	}
}

func TestTokenizer_CrossChunkBoundary(t *testing.T) {
	t.Parallel()

	// string_double spans two chunks: the closing `"` is in the second chunk.
	tok, err := parsingfx.NewTokenizer(parsingfx.SimpleTokens())
	if err != nil {
		t.Fatal(err)
	}

	tokens1, err := tok.Push(`"hello `)
	if err != nil {
		t.Fatal(err)
	}

	if len(tokens1) != 0 {
		t.Errorf("expected 0 tokens before string closes, got %d", len(tokens1))
	}

	tokens2, err := tok.Push(`world"`)
	if err != nil {
		t.Fatal(err)
	}

	flushed, err := tok.Flush()
	if err != nil {
		t.Fatal(err)
	}

	all := make([]parsingfx.Token, 0, len(tokens2)+len(flushed))
	all = append(all, tokens2...)
	all = append(all, flushed...)
	if len(all) == 0 {
		t.Fatal("expected string token after close, got none")
	}

	if all[0].Kind != "string_double" {
		t.Errorf("expected string_double, got %q", all[0].Kind)
	}

	if all[0].Value != `"hello world"` {
		t.Errorf("unexpected value: %q", all[0].Value)
	}
}

func TestTokenizer_Flush_UnmatchedBecomesUnknown(t *testing.T) {
	t.Parallel()

	defs := []parsingfx.TokenDefinition{
		{Name: "word", Pattern: `[a-z]+`},
	}

	tok, err := parsingfx.NewTokenizer(defs)
	if err != nil {
		t.Fatal(err)
	}

	// "1" does not match "word" → held in push mode
	held, err := tok.Push("1")
	if err != nil {
		t.Fatal(err)
	}

	if len(held) != 0 {
		t.Errorf("expected 0 tokens for unmatched push, got %d", len(held))
	}

	flushed, err := tok.Flush()
	if err != nil {
		t.Fatal(err)
	}

	if len(flushed) == 0 || flushed[0].Kind != "T_UNKNOWN" {
		t.Errorf("expected T_UNKNOWN from flush, got %v", flushed)
	}
}

func TestTokenizer_EmptyPush(t *testing.T) {
	t.Parallel()

	tok, err := parsingfx.NewTokenizer(parsingfx.SimpleTokens())
	if err != nil {
		t.Fatal(err)
	}

	tokens, err := tok.Push("")
	if err != nil {
		t.Fatal(err)
	}

	if len(tokens) != 0 {
		t.Errorf("expected 0 tokens for empty push, got %d", len(tokens))
	}
}

func TestTokenizer_MultiPushCharByChar(t *testing.T) {
	t.Parallel()

	input := "x + y"
	defs := parsingfx.SimpleTokens()

	tok, err := parsingfx.NewTokenizer(defs)
	if err != nil {
		t.Fatal(err)
	}

	var all []parsingfx.Token

	for i := range len(input) {
		tokens, err := tok.Push(string(input[i]))
		if err != nil {
			t.Fatal(err)
		}

		all = append(all, tokens...)
	}

	flushed, err := tok.Flush()
	if err != nil {
		t.Fatal(err)
	}

	all = append(all, flushed...)

	expected, err := parsingfx.Tokenize(input, defs)
	if err != nil {
		t.Fatal(err)
	}

	if len(all) != len(expected) {
		t.Errorf("char-by-char: %d tokens, batch: %d tokens", len(all), len(expected))
	}
}

// ─── TokenizeStream ──────────────────────────────────────────────────────────

func TestTokenizeStream_SingleChunk(t *testing.T) {
	t.Parallel()

	in := make(chan string, 1)
	in <- "foo + bar"
	close(in)

	outCh, errCh := parsingfx.TokenizeStream(context.Background(), in, parsingfx.SimpleTokens())

	var tokens []parsingfx.Token
	for batch := range outCh {
		tokens = append(tokens, batch...)
	}

	if err := <-errCh; err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected, err := parsingfx.Tokenize("foo + bar", parsingfx.SimpleTokens())
	if err != nil {
		t.Fatal(err)
	}

	if len(tokens) != len(expected) {
		t.Errorf("stream: %d tokens, batch: %d tokens", len(tokens), len(expected))
	}
}

func TestTokenizeStream_ContextCancel(t *testing.T) {
	t.Parallel()

	in := make(chan string) // never sends

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, errCh := parsingfx.TokenizeStream(ctx, in, parsingfx.SimpleTokens())

	err := <-errCh
	if err == nil {
		t.Error("expected context error, got nil")
	}
}

func TestTokenizeStream_LeakGate(t *testing.T) {
	t.Parallel()

	for range 1000 {
		in := make(chan string, 1)
		in <- "a"
		close(in)

		outCh, errCh := parsingfx.TokenizeStream(context.Background(), in, parsingfx.SimpleTokens())
		for range outCh {
		}
		<-errCh
	}
}
