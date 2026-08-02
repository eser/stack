// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase B — retroactive bridge tests for parsingfx.TokenizeStream FFI.
// Five functional tests + 1000-loop handle leak gate.

package main

import (
	"encoding/json"
	"fmt"
	"testing"
)

// ─── create ─────────────────────────────────────────────────────────────────

func TestBridgeParsingTokenizerCreate_DefaultDefs(t *testing.T) {
	t.Parallel()

	got := bridgeParsingTokenizerCreate(`{}`)
	var resp parsingTokenizerHandleResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.Handle == "" {
		t.Fatal("expected non-empty handle")
	}

	// cleanup
	bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, resp.Handle))
}

func TestBridgeParsingTokenizerCreate_CustomDefs(t *testing.T) {
	t.Parallel()

	req := `{"definitions":[{"name":"num","pattern":"\\d+"},{"name":"ws","pattern":"\\s+"}]}`
	got := bridgeParsingTokenizerCreate(req)
	var resp parsingTokenizerHandleResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.Handle == "" {
		t.Fatal("expected non-empty handle")
	}

	bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, resp.Handle))
}

// ─── push ────────────────────────────────────────────────────────────────────

func TestBridgeParsingTokenizerPush_EmitsTokens(t *testing.T) {
	t.Parallel()

	// Create with built-in defs
	createResp := bridgeParsingTokenizerCreate(`{}`)
	var cr parsingTokenizerHandleResponse
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}
	if cr.Error != "" {
		t.Fatalf("create error: %s", cr.Error)
	}

	// Push a chunk containing an identifier
	pushReq := fmt.Sprintf(`{"handle":%q,"chunk":"hello "}`, cr.Handle)
	pushResp := bridgeParsingTokenizerPush(pushReq)
	var pr parsingTokenizeResponse
	if err := json.Unmarshal([]byte(pushResp), &pr); err != nil {
		t.Fatalf("push unmarshal: %v", err)
	}
	if pr.Error != "" {
		t.Fatalf("push error: %s", pr.Error)
	}
	if len(pr.Tokens) == 0 {
		t.Fatal("expected tokens after pushing 'hello '")
	}

	// cleanup
	bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, cr.Handle))
}

func TestBridgeParsingTokenizerPush_UnknownHandle_Error(t *testing.T) {
	t.Parallel()

	got := bridgeParsingTokenizerPush(`{"handle":"tokenizer-does-not-exist","chunk":"x"}`)
	var resp parsingTokenizeResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error for unknown handle")
	}
}

// ─── close ───────────────────────────────────────────────────────────────────

func TestBridgeParsingTokenizerClose_FlushesRemaining(t *testing.T) {
	t.Parallel()

	// Use a two-char "==" token so pushing a single "=" is held in buffer
	// (no pattern matches at head → drain(false) holds it for next Push).
	createResp := bridgeParsingTokenizerCreate(
		`{"definitions":[{"name":"eq","pattern":"=="}]}`,
	)
	var cr parsingTokenizerHandleResponse
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	// Push single "=" — no pattern matches, so the character is held in buffer.
	pushResp := bridgeParsingTokenizerPush(fmt.Sprintf(`{"handle":%q,"chunk":"="}`, cr.Handle))
	var pr parsingTokenizeResponse
	if err := json.Unmarshal([]byte(pushResp), &pr); err != nil {
		t.Fatalf("push unmarshal: %v", err)
	}
	if len(pr.Tokens) != 0 {
		t.Fatalf("expected 0 tokens from push (partial token held), got %d", len(pr.Tokens))
	}

	// Close flushes remaining buffer → emits "=" as T_UNKNOWN
	closeResp := bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, cr.Handle))
	var clr parsingTokenizeResponse
	if err := json.Unmarshal([]byte(closeResp), &clr); err != nil {
		t.Fatalf("close unmarshal: %v", err)
	}
	if clr.Error != "" {
		t.Fatalf("close error: %s", clr.Error)
	}
	if len(clr.Tokens) == 0 {
		t.Fatal("expected T_UNKNOWN token flushed on close")
	}
	if clr.Tokens[0].Kind != "T_UNKNOWN" {
		t.Fatalf("expected T_UNKNOWN, got %s", clr.Tokens[0].Kind)
	}

	// Handle must be gone from map after close
	handleMu.RLock()
	_, stillPresent := tokenizerHandles[cr.Handle]
	handleMu.RUnlock()

	if stillPresent {
		t.Fatal("handle must be removed from map after close")
	}
}

// ─── leak gate ───────────────────────────────────────────────────────────────

func TestBridgeParsingTokenizer_LeakGate_1000(t *testing.T) {
	t.Parallel()

	const iterations = 1000

	for i := range iterations {
		createResp := bridgeParsingTokenizerCreate(`{}`)
		var cr parsingTokenizerHandleResponse
		if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
			t.Fatalf("iter %d create unmarshal: %v", i, err)
		}
		if cr.Error != "" {
			t.Fatalf("iter %d create error: %s", i, cr.Error)
		}

		bridgeParsingTokenizerPush(fmt.Sprintf(`{"handle":%q,"chunk":"x = 1"}`, cr.Handle))
		bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, cr.Handle))
	}

	// After all iterations the handle map must be empty (no leaked handles).
	handleMu.RLock()
	leaked := len(tokenizerHandles)
	handleMu.RUnlock()

	if leaked != 0 {
		t.Fatalf("handle leak: %d tokenizer handles remain after %d create/push/close cycles", leaked, iterations)
	}
}
