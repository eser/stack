// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"sync"

	"github.com/eser/stack/pkg/ajan/parsingfx"
)

// Streaming tokenizer handles, guarded by handleMu.
var tokenizerHandles = make(map[string]*tokenizerState)

// tokenizerState wraps a streaming tokenizer with the lock that serializes
// pushes on its handle. parsingfx.Tokenizer carries mutable scan state, so two
// concurrent Push calls on one handle would corrupt it.
type tokenizerState struct {
	tok *parsingfx.Tokenizer
	mu  sync.Mutex
}

// drainTokenizerHandles clears the tokenizer registry, which holds no OS
// resource; dropping the entries is the whole release.
func drainTokenizerHandles() shutdownStep {
	handleMu.Lock()
	clear(tokenizerHandles)
	handleMu.Unlock()

	return shutdownStep{} //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Parsing bridge
// ---------------------------------------------------------------------------

type parsingDefinitionJSON struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type parsingTokenJSON struct {
	Kind   string `json:"kind"`
	Value  string `json:"value"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
}

type parsingTokenizeRequest struct {
	Input       string                  `json:"input"`
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

type parsingTokenizeResponse struct {
	Tokens []parsingTokenJSON `json:"tokens,omitempty"`
	Error  string             `json:"error,omitempty"`
}

type parsingSimpleTokensResponse struct {
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

// bridgeParsingTokenize tokenizes an input string using provided or built-in definitions.
func bridgeParsingTokenize(requestJSON string) string {
	var req parsingTokenizeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	var defs []parsingfx.TokenDefinition

	if len(req.Definitions) > 0 {
		defs = make([]parsingfx.TokenDefinition, len(req.Definitions))
		for i, d := range req.Definitions {
			defs[i] = parsingfx.TokenDefinition{Name: d.Name, Pattern: d.Pattern}
		}
	} else {
		defs = parsingfx.SimpleTokens()
	}

	tokens, err := parsingfx.Tokenize(req.Input, defs)
	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

// bridgeParsingSimpleTokens returns the built-in SimpleTokens definitions.
func bridgeParsingSimpleTokens() string {
	simple := parsingfx.SimpleTokens()
	defs := make([]parsingDefinitionJSON, len(simple))

	for i, d := range simple {
		defs[i] = parsingDefinitionJSON{Name: d.Name, Pattern: d.Pattern}
	}

	return marshalResponse(parsingSimpleTokensResponse{Definitions: defs})
}

// ---------------------------------------------------------------------------
// Parsing streaming tokenizer bridge (handle-based)
// ---------------------------------------------------------------------------

type parsingTokenizerCreateRequest struct {
	Definitions []parsingDefinitionJSON `json:"definitions,omitempty"`
}

type parsingTokenizerHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type parsingTokenizerPushRequest struct {
	Handle string `json:"handle"`
	Chunk  string `json:"chunk"`
}

// bridgeParsingTokenizerCreate creates a streaming tokenizer handle.
func bridgeParsingTokenizerCreate(requestJSON string) string {
	var req parsingTokenizerCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizerHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	var defs []parsingfx.TokenDefinition

	for _, d := range req.Definitions {
		defs = append(defs, parsingfx.TokenDefinition{Name: d.Name, Pattern: d.Pattern})
	}

	if len(defs) == 0 {
		defs = parsingfx.SimpleTokens()
	}

	tok, err := parsingfx.NewTokenizer(defs)
	if err != nil {
		return marshalResponse(parsingTokenizerHandleResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	handle := newHandle("tokenizer")

	handleMu.Lock()
	tokenizerHandles[handle] = &tokenizerState{tok: tok} //nolint:exhaustruct
	handleMu.Unlock()

	return marshalResponse(parsingTokenizerHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeParsingTokenizerPush pushes a chunk into the tokenizer and returns
// any tokens that could be matched so far.
func bridgeParsingTokenizerPush(requestJSON string) string {
	var req parsingTokenizerPushRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.RLock()
	state, ok := tokenizerHandles[req.Handle]
	handleMu.RUnlock()

	if !ok {
		return marshalResponse(parsingTokenizeResponse{Error: "unknown tokenizer handle: " + req.Handle}) //nolint:exhaustruct
	}

	// The tokenizer buffers a partial token between pushes, so pushes on one
	// handle are serialized rather than allowed to interleave.
	state.mu.Lock()
	tokens, err := state.tok.Push(req.Chunk)
	state.mu.Unlock()

	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

// bridgeParsingTokenizerClose flushes remaining buffer and releases the handle.
func bridgeParsingTokenizerClose(requestJSON string) string {
	var req struct {
		Handle string `json:"handle"`
	}

	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.Lock()
	state, ok := tokenizerHandles[req.Handle]

	if ok {
		delete(tokenizerHandles, req.Handle)
	}

	handleMu.Unlock()

	// Closing an unknown or already-closed handle succeeds, with nothing left
	// to flush: close is idempotent across every handle kind in this bridge.
	if !ok {
		return marshalResponse(parsingTokenizeResponse{Tokens: []parsingTokenJSON{}}) //nolint:exhaustruct
	}

	state.mu.Lock()
	tokens, err := state.tok.Flush()
	state.mu.Unlock()

	if err != nil {
		return marshalResponse(parsingTokenizeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonTokens := make([]parsingTokenJSON, len(tokens))
	for i, t := range tokens {
		jsonTokens[i] = parsingTokenJSON{Kind: t.Kind, Value: t.Value, Offset: t.Offset, Length: t.Length}
	}

	return marshalResponse(parsingTokenizeResponse{Tokens: jsonTokens}) //nolint:exhaustruct
}

func init() {
	registerShutdownDrain(drainTokenizerHandles)
	register("parsingTokenize", []string{"requestJSON"}, func(a []string) string { return bridgeParsingTokenize(a[0]) })
	register("parsingSimpleTokens", nil, func(_ []string) string { return bridgeParsingSimpleTokens() })
	register("parsingTokenizeStreamCreate", []string{"requestJSON"}, func(a []string) string { return bridgeParsingTokenizerCreate(a[0]) })
	register("parsingTokenizeStreamPush", []string{"requestJSON"}, func(a []string) string { return bridgeParsingTokenizerPush(a[0]) })
	register("parsingTokenizeStreamClose", []string{"requestJSON"}, func(a []string) string { return bridgeParsingTokenizerClose(a[0]) })
}
