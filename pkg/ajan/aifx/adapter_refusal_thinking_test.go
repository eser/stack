package aifx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// These tests pin TASK-63: a refusal is reported as a refusal, and thinking
// blocks keep their own kind and their signature, so a tool-use loop can send
// them back unchanged. Anthropic rejects an assistant turn whose tool calls
// are not preceded by the thinking block that produced them.

func writeAnthropicJSON(t *testing.T, w http.ResponseWriter, body map[string]any) {
	t.Helper()

	data, err := json.Marshal(body)
	if err != nil {
		t.Errorf("marshal response: %v", err)

		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func anthropicMessageJSON(stopReason string, content ...map[string]any) map[string]any {
	return map[string]any{
		"id":          "msg_thinking_01",
		"type":        "message",
		"role":        "assistant",
		"model":       "claude-opus-4-5",
		"content":     content,
		"stop_reason": stopReason,
		"usage":       map[string]any{"input_tokens": 10, "output_tokens": 20},
	}
}

func TestAnthropicRefusalIsReported(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		writeAnthropicJSON(t, w, anthropicMessageJSON("refusal",
			map[string]any{"type": "text", "text": "I can't help with that."},
		))
	})
	defer srv.Close()

	result, err := makeTestAnthropicModel(t, srv).GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "do something declined")},
	})
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	if result.StopReason != StopReasonRefusal {
		t.Fatalf("StopReason = %q, want %q", result.StopReason, StopReasonRefusal)
	}
}

func TestAnthropicResponseKeepsThinkingBlocks(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		writeAnthropicJSON(t, w, anthropicMessageJSON("tool_use",
			map[string]any{"type": "thinking", "thinking": "Check the weather.", "signature": "sig-1"},
			// Claude 5 omits the thinking text by default; the signature still matters.
			map[string]any{"type": "thinking", "thinking": "", "signature": "sig-2"},
			map[string]any{"type": "redacted_thinking", "data": "opaque-data"},
			map[string]any{"type": "text", "text": "Looking it up."},
			map[string]any{"type": "tool_use", "id": "toolu_1", "name": "weather", "input": map[string]any{}},
		))
	})
	defer srv.Close()

	result, err := makeTestAnthropicModel(t, srv).GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "weather?")},
	})
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	want := []ThinkingPart{
		{Text: "Check the weather.", Signature: "sig-1", RedactedData: ""},
		{Text: "", Signature: "sig-2", RedactedData: ""},
		{Text: "", Signature: "", RedactedData: "opaque-data"},
	}

	if len(result.Content) != len(want)+2 {
		t.Fatalf("got %d blocks, want %d: %+v", len(result.Content), len(want)+2, result.Content)
	}

	for i, part := range want {
		block := result.Content[i]
		if block.Type != ContentBlockThinking || block.Thinking == nil {
			t.Fatalf("block %d = %+v, want a thinking block", i, block)
		}

		if *block.Thinking != part {
			t.Errorf("block %d thinking = %+v, want %+v", i, *block.Thinking, part)
		}
	}

	// Reasoning is not part of the answer.
	if got := result.Text(); got != "Looking it up." {
		t.Errorf("Text() = %q, want only the answer text", got)
	}
}

func TestAnthropicReplaysThinkingUnchanged(t *testing.T) {
	t.Parallel()

	var captured struct {
		Messages []struct {
			Role    string           `json:"role"`
			Content []map[string]any `json:"content"`
		} `json:"messages"`
	}

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Errorf("decode request: %v", err)
		}

		writeAnthropicJSON(t, w, anthropicMessageJSON("end_turn",
			map[string]any{"type": "text", "text": "Sunny."},
		))
	})
	defer srv.Close()

	assistant := Message{
		Role: RoleAssistant,
		Content: []ContentBlock{
			NewThinkingBlock(ThinkingPart{Text: "Check the weather.", Signature: "sig-1", RedactedData: ""}),
			NewThinkingBlock(ThinkingPart{Text: "", Signature: "", RedactedData: "opaque-data"}),
			// No signature, as another provider would produce: it cannot pass
			// the API's check, so it must not be sent.
			NewThinkingBlock(ThinkingPart{Text: "unsigned", Signature: "", RedactedData: ""}),
			NewToolCallBlock("toolu_1", "weather", json.RawMessage(`{}`)),
		},
	}

	_, err := makeTestAnthropicModel(t, srv).GenerateText(t.Context(), &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{
			NewTextMessage(RoleUser, "weather?"),
			assistant,
			{Role: RoleUser, Content: []ContentBlock{NewToolResultBlock("toolu_1", "sunny", false)}},
		},
	})
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	if len(captured.Messages) != 3 {
		t.Fatalf("sent %d messages, want 3", len(captured.Messages))
	}

	sent := captured.Messages[1].Content
	if len(sent) != 3 {
		t.Fatalf("assistant turn has %d blocks, want 3 (unsigned thinking dropped): %v", len(sent), sent)
	}

	wantThinking := map[string]any{"type": "thinking", "thinking": "Check the weather.", "signature": "sig-1"}
	if fmt.Sprint(sent[0]) != fmt.Sprint(wantThinking) {
		t.Errorf("block 0 = %v, want %v", sent[0], wantThinking)
	}

	wantRedacted := map[string]any{"type": "redacted_thinking", "data": "opaque-data"}
	if fmt.Sprint(sent[1]) != fmt.Sprint(wantRedacted) {
		t.Errorf("block 1 = %v, want %v", sent[1], wantRedacted)
	}

	if sent[2]["type"] != "tool_use" {
		t.Errorf("block 2 type = %v, want tool_use", sent[2]["type"])
	}
}

// sseEvent formats one server-sent event the way the Messages API streams it.
func sseEventText(eventType string, data string) string {
	return "event: " + eventType + "\ndata: " + data + "\n\n"
}

func TestAnthropicStreamCarriesThinking(t *testing.T) {
	t.Parallel()

	events := strings.Join([]string{
		sseEventText("message_start", `{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}`),
		sseEventText("content_block_start", `{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}`),
		sseEventText("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Check "}}`),
		sseEventText("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"first."}}`),
		sseEventText("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-stream"}}`),
		sseEventText("content_block_stop", `{"type":"content_block_stop","index":0}`),
		sseEventText("content_block_start", `{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`),
		sseEventText("content_block_delta", `{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"I can't help with that."}}`),
		sseEventText("content_block_stop", `{"type":"content_block_stop","index":1}`),
		sseEventText("message_delta", `{"type":"message_delta","delta":{"stop_reason":"refusal","stop_sequence":null},"usage":{"output_tokens":12}}`),
		sseEventText("message_stop", `{"type":"message_stop"}`),
	}, "")

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(events))
	})
	defer srv.Close()

	iter, err := makeTestAnthropicModel(t, srv).StreamText(t.Context(), &StreamTextOptions{ //nolint:exhaustruct
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})
	if err != nil {
		t.Fatalf("StreamText: %v", err)
	}

	result, err := iter.Collect()
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if result.StopReason != StopReasonRefusal {
		t.Errorf("StopReason = %q, want %q", result.StopReason, StopReasonRefusal)
	}

	if len(result.Content) != 2 {
		t.Fatalf("got %d blocks, want thinking then text: %+v", len(result.Content), result.Content)
	}

	thinking := result.Content[0]
	want := ThinkingPart{Text: "Check first.", Signature: "sig-stream", RedactedData: ""}

	if thinking.Type != ContentBlockThinking || thinking.Thinking == nil || *thinking.Thinking != want {
		t.Errorf("block 0 = %+v, want thinking %+v", thinking, want)
	}

	if got := result.Text(); got != "I can't help with that." {
		t.Errorf("Text() = %q", got)
	}
}

func TestMapACPStopReason(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input acpfx.StopReason
		want  StopReason
	}{
		{acpfx.StopReasonEndTurn, StopReasonEndTurn},
		{acpfx.StopReasonMaxTokens, StopReasonMaxTokens},
		{acpfx.StopReasonRefusal, StopReasonRefusal},
		{acpfx.StopReasonMaxTurnRequests, StopReasonEndTurn},
		{acpfx.StopReasonCancelled, StopReasonEndTurn},
	}

	for _, tc := range cases {
		t.Run(string(tc.input), func(t *testing.T) {
			t.Parallel()

			if got := mapACPStopReason(tc.input); got != tc.want {
				t.Errorf("mapACPStopReason(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
