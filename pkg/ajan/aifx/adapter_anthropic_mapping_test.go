package aifx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// makeTestAnthropicModel creates a real AnthropicModel with a dummy key pointing at srv.
func makeTestAnthropicModel(t *testing.T, srv *httptest.Server) *AnthropicModel {
	t.Helper()

	client := anthropic.NewClient(
		option.WithAPIKey("test-key"),
		option.WithBaseURL(srv.URL),
	)

	return &AnthropicModel{
		client: client,
		config: &ConfigTarget{
			APIKey:      "test-key",
			Model:       "claude-opus-4-5",
			Temperature: 0.8,
		},
	}
}

func TestMapAnthropicStopReason(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input anthropic.StopReason
		want  StopReason
	}{
		{anthropic.StopReasonEndTurn, StopReasonEndTurn},
		{anthropic.StopReasonMaxTokens, StopReasonMaxTokens},
		{anthropic.StopReasonToolUse, StopReasonToolUse},
		{anthropic.StopReasonStopSequence, StopReasonStop},
		{"unknown", StopReasonEndTurn},
	}

	for _, tc := range tests {
		t.Run(string(tc.input), func(t *testing.T) {
			t.Parallel()

			got := mapAnthropicStopReason(tc.input)
			if got != tc.want {
				t.Errorf("mapAnthropicStopReason(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestAnthropicModel_GenerateText_WithTemperatureAndTools(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("Result", "claude-opus-4-5", 10, 5))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	temp := 0.5
	topP := 0.9

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages:    []Message{NewTextMessage(RoleUser, "hi")},
		Temperature: &temp,
		TopP:        &topP,
		StopWords:   []string{"END"},
		Tools: []ToolDefinition{
			{Name: "search", Description: "search the web", Parameters: json.RawMessage(`{"type":"object"}`)},
		},
		ToolChoice: ToolChoiceAuto,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	// Verify tools were included in the request
	if _, hasTools := capturedBody["tools"]; !hasTools {
		t.Error("expected tools in request body")
	}
}

func TestAnthropicModel_GenerateText_WithThinkingBudget(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("Thought result", "claude-opus-4-5", 10, 50))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	budget := 4096
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages:       []Message{NewTextMessage(RoleUser, "reason about this")},
		ThinkingBudget: &budget,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ConfigTemperature(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	// Model has Temperature=0.8 in config but no opts.Temperature
	model := makeTestAnthropicModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	// Temperature should have been set from config
	if _, hasTemp := capturedBody["temperature"]; !hasTemp {
		t.Error("expected temperature from config to be included in request body")
	}
}

func TestAnthropicModel_GenerateText_MessageRoles(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	// Mix of roles including system (system should be filtered from messages array)
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewTextMessage(RoleSystem, "system instructions"),
			NewTextMessage(RoleUser, "user question"),
			NewTextMessage(RoleAssistant, "previous reply"),
			NewTextMessage(RoleUser, "follow up"),
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ToolCallAndResult(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("done", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	// Message with tool call and tool result content blocks
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewTextMessage(RoleUser, "find info"),
			{
				Role: RoleAssistant,
				Content: []ContentBlock{
					NewToolCallBlock("tc-1", "search", json.RawMessage(`{"query":"test"}`)),
				},
			},
			{
				Role: RoleUser,
				Content: []ContentBlock{
					NewToolResultBlock("tc-1", "search results", false),
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ToolChoiceVariants(t *testing.T) {
	t.Parallel()

	testCases := []ToolChoice{
		ToolChoiceAuto,
		ToolChoiceNone,
		ToolChoiceRequired,
	}

	for _, tc := range testCases {
		t.Run(string(tc), func(t *testing.T) {
			t.Parallel()

			srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
			})
			defer srv.Close()

			model := makeTestAnthropicModel(t, srv)

			_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
				Messages:   []Message{NewTextMessage(RoleUser, "hi")},
				ToolChoice: tc,
			})

			if err != nil {
				t.Fatalf("GenerateText with ToolChoice=%q error: %v", tc, err)
			}
		})
	}
}

func TestAnthropicModel_GenerateText_ImageMessage(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("I see an image", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewImageMessage(RoleUser, "https://example.com/photo.jpg", ImageDetailHigh),
		},
	})

	if err != nil {
		t.Fatalf("GenerateText with image error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ImageWithData(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	// Exercise mapImageBlock with raw image data bytes.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{
						Type: ContentBlockImage,
						Image: &ImagePart{
							Data:     []byte{0x89, 0x50, 0x4e, 0x47}, // PNG bytes
							MIMEType: "image/png",
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText with image data error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ImageWithDataURL(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	// Exercise mapImageBlock with a data URL.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{
						Type: ContentBlockImage,
						Image: &ImagePart{
							URL: "data:image/jpeg;base64,aGVsbG8=",
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText with data URL image error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ImageWithDefaultMIME(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 5, 3))
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	// Image data with empty MIME type — should default to image/png.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{
						Type: ContentBlockImage,
						Image: &ImagePart{
							Data: []byte{0x89, 0x50, 0x4e, 0x47},
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText with default MIME image error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_ToolUseResponse(t *testing.T) {
	t.Parallel()

	toolUseResp := map[string]any{
		"id":    "msg_test_01",
		"type":  "message",
		"role":  "assistant",
		"model": "claude-opus-4-5",
		"content": []map[string]any{
			{
				"type":  "tool_use",
				"id":    "tc-1",
				"name":  "search",
				"input": map[string]any{"query": "test"},
			},
		},
		"stop_reason": "tool_use",
		"usage":       map[string]any{"input_tokens": 10, "output_tokens": 5},
	}

	b, _ := json.Marshal(toolUseResp)

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(b)
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	result, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "use a tool")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.StopReason != StopReasonToolUse {
		t.Errorf("expected tool_use stop reason, got %q", result.StopReason)
	}

	if len(result.ToolCalls()) != 1 {
		t.Errorf("expected 1 tool call, got %d", len(result.ToolCalls()))
	}
}

func TestMapAnthropicToolChoice_Default(t *testing.T) {
	t.Parallel()

	// An unrecognized ToolChoice should fall back to "auto".
	result := mapAnthropicToolChoice(ToolChoice("unrecognized"))

	if result.OfAuto == nil {
		t.Error("expected OfAuto to be set for unrecognized ToolChoice")
	}
}

func TestAnthropicModel_GenerateText_ThinkingResponse(t *testing.T) {
	t.Parallel()

	thinkingResp := map[string]any{
		"id":    "msg_thinking_01",
		"type":  "message",
		"role":  "assistant",
		"model": "claude-opus-4-5",
		"content": []map[string]any{
			{"type": "thinking", "thinking": "Let me reason through this."},
			{"type": "text", "text": "The answer is 42."},
		},
		"stop_reason": "end_turn",
		"usage":       map[string]any{"input_tokens": 10, "output_tokens": 20},
	}

	b, _ := json.Marshal(thinkingResp)

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(b)
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	result, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "what is the answer?")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	// Should have both thinking block (as text) and text block.
	if len(result.Content) < 2 {
		t.Errorf("expected at least 2 content blocks (thinking+text), got %d", len(result.Content))
	}
}

func TestAnthropicModel_GenerateText_RateLimitError(t *testing.T) {
	t.Parallel()

	errResp := map[string]any{
		"type": "error",
		"error": map[string]any{
			"type":    "rate_limit_error",
			"message": "Rate limit exceeded",
		},
	}

	b, _ := json.Marshal(errResp)

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write(b)
	})
	defer srv.Close()

	model := makeTestAnthropicModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err == nil {
		t.Fatal("expected error for rate limit response")
	}
}

func TestAnthropicModel_MapToolCallBlock_Nil(t *testing.T) {
	t.Parallel()

	m := &AnthropicModel{
		client: anthropic.NewClient(option.WithAPIKey("test")),
		config: &ConfigTarget{APIKey: "test", Model: "claude-opus-4-5"},
	}

	result, err := m.mapToolCallBlock(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != nil {
		t.Error("expected nil result for nil toolCall")
	}
}

func TestAnthropicModel_MapSingleContentBlock_AudioType(t *testing.T) {
	t.Parallel()

	// Audio blocks are unsupported and should be silently skipped (return nil, nil).
	m := &AnthropicModel{
		client: anthropic.NewClient(option.WithAPIKey("test")),
		config: &ConfigTarget{APIKey: "test", Model: "claude-opus-4-5"},
	}

	result, err := m.mapSingleContentBlock(ContentBlock{Type: ContentBlockAudio})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != nil {
		t.Error("expected nil result for unsupported audio block type")
	}
}

func TestAnthropicModel_MapToolResultBlock_Nil(t *testing.T) {
	t.Parallel()

	m := &AnthropicModel{
		client: anthropic.NewClient(option.WithAPIKey("test")),
		config: &ConfigTarget{APIKey: "test", Model: "claude-opus-4-5"},
	}

	result, err := m.mapToolResultBlock(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != nil {
		t.Error("expected nil result for nil toolResult")
	}
}
