package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// ─── mapClaudeCodeStreamEvent ────────────────────────────────────────────────

func TestMapClaudeCodeStreamEvent_AssistantMessage(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.Type != StreamEventContentDelta {
		t.Errorf("expected content_delta, got %q", ev.Type)
	}

	if ev.TextDelta != "hello" {
		t.Errorf("expected 'hello', got %q", ev.TextDelta)
	}
}

func TestMapClaudeCodeStreamEvent_ContentBlockDelta(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.TextDelta != "world" {
		t.Errorf("expected 'world', got %q", ev.TextDelta)
	}
}

func TestMapClaudeCodeStreamEvent_Result_EndTurn(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"result","usage":{"input_tokens":10,"output_tokens":5}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.Type != StreamEventMessageDone {
		t.Errorf("expected message_done, got %q", ev.Type)
	}

	if ev.StopReason != StopReasonEndTurn {
		t.Errorf("expected end_turn, got %q", ev.StopReason)
	}

	if ev.Usage == nil || ev.Usage.InputTokens != 10 {
		t.Errorf("expected 10 input tokens, got %+v", ev.Usage)
	}
}

func TestMapClaudeCodeStreamEvent_Result_ToolUse(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"result","subtype":"tool_use","usage":{"input_tokens":5,"output_tokens":3}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.StopReason != StopReasonToolUse {
		t.Errorf("expected tool_use, got %q", ev.StopReason)
	}
}

func TestMapClaudeCodeStreamEvent_Error(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"error","error":{"message":"something went wrong"}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.Type != StreamEventError {
		t.Errorf("expected error event, got %q", ev.Type)
	}

	if !errors.Is(ev.Error, ErrClaudeCodeStreamFailed) {
		t.Errorf("expected ErrClaudeCodeStreamFailed in chain, got %v", ev.Error)
	}
}

func TestMapClaudeCodeStreamEvent_ContentFallback(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"unknown","content":"fallback text"}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event for content fallback")
	}

	if ev.TextDelta != "fallback text" {
		t.Errorf("expected 'fallback text', got %q", ev.TextDelta)
	}
}

func TestMapClaudeCodeStreamEvent_AssistantNoText(t *testing.T) {
	t.Parallel()

	// Assistant message with no text blocks → returns nil (falls through switch).
	raw := json.RawMessage(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"fn"}]}}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev != nil {
		t.Error("expected nil when assistant message has no text blocks")
	}
}

func TestMapClaudeCodeStreamEvent_Malformed(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{invalid`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev != nil {
		t.Error("expected nil for malformed JSON")
	}
}

func TestMapClaudeCodeStreamEvent_NoType(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"data":"something"}`)
	ev := mapClaudeCodeStreamEvent(raw)

	if ev != nil {
		t.Error("expected nil when no type field")
	}
}

// ─── parseClaudeCodeUsage ────────────────────────────────────────────────────

func TestParseClaudeCodeUsage_WithUsage(t *testing.T) {
	t.Parallel()

	obj := map[string]json.RawMessage{
		"usage": json.RawMessage(`{"input_tokens":8,"output_tokens":4}`),
	}

	u := parseClaudeCodeUsage(obj)

	if u.InputTokens != 8 {
		t.Errorf("expected 8 input tokens, got %d", u.InputTokens)
	}

	if u.TotalTokens != 12 {
		t.Errorf("expected 12 total tokens, got %d", u.TotalTokens)
	}
}

func TestParseClaudeCodeUsage_NoUsage(t *testing.T) {
	t.Parallel()

	obj := map[string]json.RawMessage{}

	u := parseClaudeCodeUsage(obj)

	if u.InputTokens != 0 || u.OutputTokens != 0 {
		t.Errorf("expected zero usage, got %+v", u)
	}
}

// ─── extractErrorMessage ─────────────────────────────────────────────────────

func TestExtractErrorMessage_WithMessage(t *testing.T) {
	t.Parallel()

	obj := map[string]json.RawMessage{
		"error": json.RawMessage(`{"message":"auth failed"}`),
	}

	msg := extractErrorMessage(obj)
	if msg != "auth failed" {
		t.Errorf("expected 'auth failed', got %q", msg)
	}
}

func TestExtractErrorMessage_NoError(t *testing.T) {
	t.Parallel()

	obj := map[string]json.RawMessage{}

	msg := extractErrorMessage(obj)
	if msg != "unknown Claude Code error" {
		t.Errorf("expected default message, got %q", msg)
	}
}

// ─── KiroModel / OpenCodeModel methods ───────────────────────────────────────

func TestKiroModel_Methods(t *testing.T) {
	t.Parallel()

	m := &KiroModel{
		config:     &ConfigTarget{Model: "kiro-v1"},
		binaryPath: "/bin/sh",
	}

	if m.GetProvider() != kiroProviderName {
		t.Errorf("expected %q, got %q", kiroProviderName, m.GetProvider())
	}

	if m.GetModelID() != "kiro-v1" {
		t.Errorf("expected 'kiro-v1', got %q", m.GetModelID())
	}

	caps := m.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	if m.GetRawClient() != nil {
		t.Error("expected nil raw client for CLI model")
	}

	if err := m.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestOpenCodeModel_Methods(t *testing.T) {
	t.Parallel()

	m := &OpenCodeModel{
		config:     &ConfigTarget{Model: "gpt-4o"},
		binaryPath: "/bin/sh",
	}

	if m.GetProvider() != openCodeProviderName {
		t.Errorf("expected %q, got %q", openCodeProviderName, m.GetProvider())
	}

	if m.GetModelID() != "gpt-4o" {
		t.Errorf("expected 'gpt-4o', got %q", m.GetModelID())
	}

	caps := m.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	if m.GetRawClient() != nil {
		t.Error("expected nil raw client for CLI model")
	}

	if err := m.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

// ─── mapClaudeCodeJsonResult ─────────────────────────────────────────────────

func TestMapClaudeCodeJsonResult_ToolUseEmptyID(t *testing.T) {
	t.Parallel()

	// When tool_use block has an empty ID, the name is used as the ID.
	parsed := map[string]json.RawMessage{
		"message":     json.RawMessage(`{"content":[{"type":"tool_use","id":"","name":"search","input":{"q":"x"}}]}`),
		"stop_reason": json.RawMessage(`"tool_use"`),
	}

	result := mapClaudeCodeJsonResult(parsed, "claude-opus-4-5")

	if result.StopReason != StopReasonToolUse {
		t.Errorf("expected tool_use stop reason, got %q", result.StopReason)
	}

	calls := result.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(calls))
	}

	if calls[0].ID != "search" {
		t.Errorf("expected ID='search' (fallback from name), got %q", calls[0].ID)
	}
}

func TestMapClaudeCodeJsonResult_FallbackSerialization(t *testing.T) {
	t.Parallel()

	// Neither "result" nor "message" key → fallback serializes the whole object as text.
	parsed := map[string]json.RawMessage{
		"custom_field": json.RawMessage(`"some value"`),
	}

	result := mapClaudeCodeJsonResult(parsed, "claude-opus-4-5")

	if len(result.Content) != 1 {
		t.Fatalf("expected 1 content block from fallback, got %d", len(result.Content))
	}

	if result.Content[0].Type != ContentBlockText {
		t.Errorf("expected text content block, got %q", result.Content[0].Type)
	}

	if result.Content[0].Text == "" {
		t.Error("expected non-empty fallback text")
	}
}

func TestExtractErrorMessage_ErrorKeyNoMessage(t *testing.T) {
	t.Parallel()

	// "error" key exists but has no "message" field → fallback to default.
	obj := map[string]json.RawMessage{
		"error": json.RawMessage(`{"code":500}`),
	}

	msg := extractErrorMessage(obj)
	if msg != "unknown Claude Code error" {
		t.Errorf("expected default message for empty error message, got %q", msg)
	}
}

// ─── mapOpenCodeStreamEvent ───────────────────────────────────────────────────

func TestMapOpenCodeStreamEvent_DoneFlag(t *testing.T) {
	t.Parallel()

	// { "done": true } triggers the Ollama-style done path.
	raw := json.RawMessage(`{"done":true}`)
	ev := mapOpenCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event for done:true")
	}

	if ev.Type != StreamEventMessageDone {
		t.Errorf("expected message_done, got %q", ev.Type)
	}
}

func TestMapOpenCodeStreamEvent_Result(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"result","usage":{"input_tokens":3,"output_tokens":2}}`)
	ev := mapOpenCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.Type != StreamEventMessageDone {
		t.Errorf("expected message_done, got %q", ev.Type)
	}

	if ev.Usage == nil || ev.Usage.InputTokens != 3 {
		t.Errorf("expected 3 input tokens, got %+v", ev.Usage)
	}
}

func TestMapOpenCodeStreamEvent_Error(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"error","error":{"message":"opencode failed"}}`)
	ev := mapOpenCodeStreamEvent(raw)

	if ev == nil {
		t.Fatal("expected non-nil event")
	}

	if ev.Type != StreamEventError {
		t.Errorf("expected error event, got %q", ev.Type)
	}

	if !errors.Is(ev.Error, ErrOpenCodeStreamFailed) {
		t.Errorf("expected ErrOpenCodeStreamFailed, got %v", ev.Error)
	}
}

func TestMapOpenCodeStreamEvent_Malformed(t *testing.T) {
	t.Parallel()

	ev := mapOpenCodeStreamEvent(json.RawMessage(`{invalid`))
	if ev != nil {
		t.Error("expected nil for malformed JSON")
	}
}

func TestMapOpenCodeStreamEvent_NoType_NoDone(t *testing.T) {
	t.Parallel()

	ev := mapOpenCodeStreamEvent(json.RawMessage(`{"data":"x"}`))
	if ev != nil {
		t.Error("expected nil when no type and no done flag")
	}
}

// ─── mapKiroStreamEvent ───────────────────────────────────────────────────────

func TestMapKiroStreamEvent_Done(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"done":true}`)
	ev := mapKiroStreamEvent(raw)

	if ev == nil || ev.Type != StreamEventMessageDone {
		t.Errorf("expected message_done event, got %+v", ev)
	}
}

func TestMapKiroStreamEvent_Text(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"text","text":"hello kiro"}`)
	ev := mapKiroStreamEvent(raw)

	if ev == nil || ev.TextDelta != "hello kiro" {
		t.Errorf("expected 'hello kiro' delta, got %+v", ev)
	}
}

func TestMapKiroStreamEvent_ContentFallback(t *testing.T) {
	t.Parallel()

	// "content" type with no "text" key falls back to "content" field.
	raw := json.RawMessage(`{"type":"content","content":"fallback text"}`)
	ev := mapKiroStreamEvent(raw)

	if ev == nil || ev.TextDelta != "fallback text" {
		t.Errorf("expected 'fallback text' delta, got %+v", ev)
	}
}

func TestMapKiroStreamEvent_Result(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{"type":"result","usage":{"input_tokens":5,"output_tokens":3}}`)
	ev := mapKiroStreamEvent(raw)

	if ev == nil || ev.Type != StreamEventMessageDone {
		t.Errorf("expected message_done, got %+v", ev)
	}

	if ev.Usage == nil || ev.Usage.InputTokens != 5 {
		t.Errorf("expected 5 input tokens, got %+v", ev.Usage)
	}
}

func TestMapKiroStreamEvent_Error_MessageField(t *testing.T) {
	t.Parallel()

	// Error event where "message" key is used instead of "error.message".
	raw := json.RawMessage(`{"type":"error","message":"kiro failed with message key"}`)
	ev := mapKiroStreamEvent(raw)

	if ev == nil || ev.Type != StreamEventError {
		t.Errorf("expected error event, got %+v", ev)
	}

	if !errors.Is(ev.Error, ErrKiroStreamFailed) {
		t.Errorf("expected ErrKiroStreamFailed, got %v", ev.Error)
	}
}

func TestMapKiroStreamEvent_Malformed(t *testing.T) {
	t.Parallel()

	ev := mapKiroStreamEvent(json.RawMessage(`{invalid`))
	if ev != nil {
		t.Error("expected nil for malformed JSON")
	}
}

func TestMapKiroStreamEvent_UnknownType(t *testing.T) {
	t.Parallel()

	ev := mapKiroStreamEvent(json.RawMessage(`{"type":"unknown_event"}`))
	if ev != nil {
		t.Error("expected nil for unknown event type")
	}
}

// ─── OllamaModel GetCapabilities ─────────────────────────────────────────────

func TestOllamaModel_GetCapabilities(t *testing.T) {
	t.Parallel()

	// OllamaModel.GetCapabilities was 0% since existing tests used the factory.
	// Construct directly to hit the method.
	m := &OllamaModel{
		config: &ConfigTarget{Model: "llama3"},
	}

	caps := m.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}
}
