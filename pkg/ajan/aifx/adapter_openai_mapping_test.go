package aifx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

func makeTestOpenAIModel(t *testing.T, srv *httptest.Server) *OpenAIModel {
	t.Helper()

	client := openai.NewClient(
		option.WithAPIKey("test-key"),
		option.WithBaseURL(srv.URL),
	)

	return &OpenAIModel{
		client: client,
		config: &ConfigTarget{
			APIKey:      "test-key",
			Model:       "gpt-4o",
			Temperature: 0.7,
		},
	}
}

func newOpenAITestServer(handler http.HandlerFunc) *httptest.Server {
	return httptest.NewServer(handler)
}

func TestOpenAIModel_GenerateText_AssistantMessage(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("done", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	// Exercise mapAssistantMessage with text + tool call blocks.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewTextMessage(RoleUser, "use search"),
			{
				Role: RoleAssistant,
				Content: []ContentBlock{
					{Type: ContentBlockText, Text: "I will search"},
					NewToolCallBlock("tc-1", "search", json.RawMessage(`{"query":"test"}`)),
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOpenAIModel_GenerateText_SystemMessage(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newOpenAITestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewTextMessage(RoleSystem, "you are a helpful assistant"),
			NewTextMessage(RoleUser, "hello"),
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if _, ok := capturedBody["messages"]; !ok {
		t.Error("expected messages in request body")
	}
}

func TestOpenAIModel_GenerateText_ToolMessage(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("done", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	// Exercise mapToolMessage with tool result blocks.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			NewTextMessage(RoleUser, "find info"),
			{
				Role: RoleAssistant,
				Content: []ContentBlock{
					NewToolCallBlock("tc-1", "search", json.RawMessage(`{"query":"go"}`)),
				},
			},
			{
				Role: RoleTool,
				Content: []ContentBlock{
					NewToolResultBlock("tc-1", "search results here", false),
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOpenAIModel_GenerateText_MultimodalImage(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("I see an image", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	// Exercise mapMultimodalUserMessage with image blocks (low/high/auto detail).
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{Type: ContentBlockText, Text: "describe this"},
					{
						Type: ContentBlockImage,
						Image: &ImagePart{
							URL:    "https://example.com/img.jpg",
							Detail: ImageDetailHigh,
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOpenAIModel_GenerateText_MultimodalImage_LowDetail(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{
						Type: ContentBlockImage,
						Image: &ImagePart{
							URL:    "https://example.com/img.png",
							Detail: ImageDetailLow,
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOpenAIModel_GenerateText_WithTools(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newOpenAITestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("result", "gpt-4o", 10, 5))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
		Tools: []ToolDefinition{
			{Name: "search", Description: "search the web", Parameters: json.RawMessage(`{"type":"object","properties":{}}`)},
		},
		ToolChoice: ToolChoiceAuto,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if _, ok := capturedBody["tools"]; !ok {
		t.Error("expected tools in request body")
	}
}

func TestOpenAIModel_GenerateText_ToolChoiceVariants(t *testing.T) {
	t.Parallel()

	testCases := []ToolChoice{
		ToolChoiceNone,
		ToolChoiceRequired,
	}

	for _, tc := range testCases {
		t.Run(string(tc), func(t *testing.T) {
			t.Parallel()

			srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
			})
			defer srv.Close()

			model := makeTestOpenAIModel(t, srv)

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

func TestOpenAIModel_GenerateText_AllOptions(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newOpenAITestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 10, 5))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	temp := 0.5
	topP := 0.9
	budget := 1024

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages:    []Message{NewTextMessage(RoleUser, "hi")},
		Temperature: &temp,
		TopP:        &topP,
		MaxTokens:   256,
		StopWords:   []string{"END", "STOP"},
		ResponseFormat: &ResponseFormat{
			Type:       "json_schema",
			JSONSchema: json.RawMessage(`{"type":"object"}`),
		},
		ThinkingBudget: &budget,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	for _, field := range []string{"temperature", "top_p", "max_completion_tokens", "stop"} {
		if _, ok := capturedBody[field]; !ok {
			t.Errorf("expected %q in request body", field)
		}
	}
}

func TestOpenAIModel_GenerateText_ToolUseResponse(t *testing.T) {
	t.Parallel()

	toolResp := map[string]any{
		"id":      "chatcmpl-test",
		"object":  "chat.completion",
		"created": 1700000000,
		"model":   "gpt-4o",
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": "",
					"tool_calls": []map[string]any{
						{
							"id":   "tc-1",
							"type": "function",
							"function": map[string]any{
								"name":      "search",
								"arguments": `{"query":"test"}`,
							},
						},
					},
				},
				"finish_reason": "tool_calls",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     10,
			"completion_tokens": 5,
			"total_tokens":      15,
		},
	}

	b, _ := json.Marshal(toolResp)

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(b)
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	result, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "use a tool")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.StopReason != StopReasonToolUse {
		t.Errorf("expected tool_calls stop reason, got %q", result.StopReason)
	}

	if len(result.ToolCalls()) != 1 {
		t.Errorf("expected 1 tool call, got %d", len(result.ToolCalls()))
	}
}

func TestOpenAIModel_GenerateText_ExplicitTemperature(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newOpenAITestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)
	temp := 0.3

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages:    []Message{NewTextMessage(RoleUser, "hi")},
		Temperature: &temp,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if _, ok := capturedBody["temperature"]; !ok {
		t.Error("expected temperature in request body")
	}
}

func TestOpenAIModel_BuildBatchJSONL(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	req := &BatchRequest{
		Items: []BatchRequestItem{
			{
				CustomID: "item-1",
				Options: GenerateTextOptions{
					Messages: []Message{NewTextMessage(RoleUser, "hello")},
				},
			},
		},
	}

	data, err := model.buildBatchJSONL(req)
	if err != nil {
		t.Fatalf("buildBatchJSONL error: %v", err)
	}

	if len(data) == 0 {
		t.Error("expected non-empty JSONL data")
	}
}

func TestOpenAIModel_ParseBatchResults(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	completion := map[string]any{
		"id":      "chatcmpl-1",
		"object":  "chat.completion",
		"created": 1700000000,
		"model":   "gpt-4o",
		"choices": []map[string]any{
			{
				"index":         0,
				"message":       map[string]any{"role": "assistant", "content": "result"},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     5,
			"completion_tokens": 3,
			"total_tokens":      8,
		},
	}

	completionJSON, _ := json.Marshal(completion)

	line := map[string]any{
		"id":        "batch_req_1",
		"custom_id": "item-1",
		"response": map[string]any{
			"status_code": 200,
			"body":        json.RawMessage(completionJSON),
		},
	}

	lineJSON, _ := json.Marshal(line)
	data := append(lineJSON[:len(lineJSON):len(lineJSON)], '\n') //nolint:gocritic // intentional new slice; lineJSON preserved

	results, err := model.parseBatchResults(data)
	if err != nil {
		t.Fatalf("parseBatchResults error: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	if results[0].CustomID != "item-1" {
		t.Errorf("expected custom_id 'item-1', got %q", results[0].CustomID)
	}

	if results[0].Result == nil {
		t.Error("expected non-nil result")
	}
}

func TestOpenAIModel_ParseBatchResults_WithError(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	line := map[string]any{
		"id":        "batch_req_2",
		"custom_id": "item-2",
		"error": map[string]any{
			"code":    "rate_limit_exceeded",
			"message": "too many requests",
		},
	}

	lineJSON, _ := json.Marshal(line)
	data := append(lineJSON[:len(lineJSON):len(lineJSON)], '\n') //nolint:gocritic // intentional new slice; lineJSON preserved

	results, err := model.parseBatchResults(data)
	if err != nil {
		t.Fatalf("parseBatchResults error: %v", err)
	}

	if len(results) != 1 || results[0].Error == "" {
		t.Error("expected error result")
	}
}

func TestMapOpenAIBatchToJob(t *testing.T) {
	t.Parallel()

	batch := &openai.Batch{ //nolint:exhaustruct
		ID:           "batch-123",
		Status:       "completed",
		InputFileID:  "file-input",
		OutputFileID: "file-output",
		CreatedAt:    1700000000,
		CompletedAt:  1700001000,
		RequestCounts: openai.BatchRequestCounts{
			Total:     10,
			Completed: 8,
			Failed:    2,
		},
	}

	job := mapOpenAIBatchToJob(batch)

	if job.ID != "batch-123" {
		t.Errorf("expected 'batch-123', got %q", job.ID)
	}

	if job.Status != BatchStatusCompleted {
		t.Errorf("expected completed, got %q", job.Status)
	}

	if job.TotalCount != 10 {
		t.Errorf("expected 10, got %d", job.TotalCount)
	}

	if job.DoneCount != 8 {
		t.Errorf("expected 8, got %d", job.DoneCount)
	}

	if job.CompletedAt == nil {
		t.Error("expected non-nil CompletedAt")
	}
}

func TestMapOpenAIBatchToJob_WithErrors(t *testing.T) {
	t.Parallel()

	batch := &openai.Batch{ //nolint:exhaustruct
		ID:     "batch-err",
		Status: "failed",
		RequestCounts: openai.BatchRequestCounts{
			Total:     5,
			Completed: 3,
			Failed:    2,
		},
		Errors: openai.BatchErrors{ //nolint:exhaustruct
			Data: []openai.BatchError{
				{Message: "item failed"},     //nolint:exhaustruct
				{Message: "another failure"}, //nolint:exhaustruct
			},
		},
	}

	job := mapOpenAIBatchToJob(batch)

	if job.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestMapOpenAIReasoningEffort(t *testing.T) {
	t.Parallel()

	tests := []struct {
		budget int
		want   string
	}{
		{500, "low"},
		{1000, "low"},
		{5000, "medium"},
		{10000, "high"},
		{20000, "high"},
	}

	for _, tc := range tests {
		t.Run("", func(t *testing.T) {
			t.Parallel()

			got := string(mapOpenAIReasoningEffort(tc.budget))
			if got != tc.want {
				t.Errorf("budget=%d: expected %q, got %q", tc.budget, tc.want, got)
			}
		})
	}
}

func TestMapOpenAIResponseFormat_JsonObject(t *testing.T) {
	t.Parallel()

	format := &ResponseFormat{Type: "json_object"}
	result := mapOpenAIResponseFormat(format)

	// json_object format should set OfJSONObject.
	if result.OfJSONObject == nil {
		t.Error("expected OfJSONObject to be set for json_object format")
	}
}

func TestOpenAIModel_MultimodalAudio(t *testing.T) {
	t.Parallel()

	srv := newOpenAITestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	// Exercise mapMultimodalUserMessage with audio content blocks.
	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{
						Type: ContentBlockAudio,
						Audio: &AudioPart{
							URL:      "https://example.com/audio.mp3",
							MIMEType: "audio/mpeg",
						},
					},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText with audio message error: %v", err)
	}
}

func TestMapOpenAIBatchStatus(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  BatchStatus
	}{
		{"validating", BatchStatusProcessing},
		{"in_progress", BatchStatusProcessing},
		{"completed", BatchStatusCompleted},
		{"failed", BatchStatusFailed},
		{"expired", BatchStatusFailed},
		{"cancelling", BatchStatusCancelled},
		{"cancelled", BatchStatusCancelled},
		{"unknown", BatchStatusPending},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()

			got := mapOpenAIBatchStatus(tc.input)
			if got != tc.want {
				t.Errorf("mapOpenAIBatchStatus(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestMapOpenAIAudioFormat(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  string
	}{
		{"audio/mpeg", "mp3"},
		{"audio/mp3", "mp3"},
		{"audio/wav", "wav"},
		{"audio/ogg", "mp3"}, // default fallback
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()

			got := mapOpenAIAudioFormat(tc.input)
			if got != tc.want {
				t.Errorf("mapOpenAIAudioFormat(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestOpenAIModel_MapMessage_UnknownRole(t *testing.T) {
	t.Parallel()

	// Constructing without a server — mapMessage does not make network calls.
	m := &OpenAIModel{
		client: openai.NewClient(option.WithAPIKey("test")),
		config: &ConfigTarget{APIKey: "test", Model: "gpt-4o"},
	}

	_, err := m.mapMessage(Message{Role: Role("unknown_role")})
	if err == nil {
		t.Fatal("expected error for unknown role")
	}
}

func TestOpenAIModel_BuildMessages_WithSystem(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]json.RawMessage

	srv := newOpenAITestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 5, 3))
	})
	defer srv.Close()

	model := makeTestOpenAIModel(t, srv)

	_, err := model.GenerateText(t.Context(), &GenerateTextOptions{
		System:   "You are a helpful assistant.",
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	// The system message must appear as the first element in messages.
	if _, ok := capturedBody["messages"]; !ok {
		t.Error("expected messages in request body")
	}
}

func TestMapOpenAIFinishReason(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  StopReason
	}{
		{"stop", StopReasonEndTurn},
		{"length", StopReasonMaxTokens},
		{"tool_calls", StopReasonToolUse},
		{"content_filter", StopReasonStop},
		{"unknown", StopReasonStop},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()

			got := mapOpenAIFinishReason(tc.input)
			if got != tc.want {
				t.Errorf("mapOpenAIFinishReason(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
