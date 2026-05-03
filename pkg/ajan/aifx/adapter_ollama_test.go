package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func ollamaChatResponseJSON(content string, promptTokens, evalTokens int) []byte {
	resp := map[string]any{
		"model":             "llama3",
		"done":              true,
		"done_reason":       "stop",
		"prompt_eval_count": promptTokens,
		"eval_count":        evalTokens,
		"message": map[string]any{
			"role":    "assistant",
			"content": content,
		},
	}

	b, _ := json.Marshal(resp)

	return b
}

func newOllamaTestServer(handler http.HandlerFunc) *httptest.Server {
	return httptest.NewServer(handler)
}

func ollamaConfig(srv *httptest.Server, model string) *ConfigTarget { //nolint:unparam // test helper kept parameterised for readability
	return &ConfigTarget{
		Model: model,
		Properties: map[string]any{
			"baseUrl": srv.URL,
		},
	}
}

func TestOllamaModelFactory_GetProvider(t *testing.T) {
	t.Parallel()

	f := NewOllamaModelFactory()
	if f.GetProvider() != ollamaProviderName {
		t.Errorf("expected %q, got %q", ollamaProviderName, f.GetProvider())
	}
}

func TestOllamaModelFactory_CreateModel_Validation(t *testing.T) {
	t.Parallel()

	f := NewOllamaModelFactory()

	_, err := f.CreateModel(context.Background(), &ConfigTarget{})
	if !errors.Is(err, ErrInvalidModel) {
		t.Errorf("expected ErrInvalidModel, got %v", err)
	}
}

func TestOllamaModel_Metadata(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON("hi", 5, 2))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	if model.GetProvider() != ollamaProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if model.GetModelID() != "llama3" {
		t.Errorf("wrong model ID: %s", model.GetModelID())
	}

	if model.GetRawClient() == nil {
		t.Error("expected non-nil raw client")
	}

	if err := model.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestOllamaModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON("Hello Ollama", 10, 5))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	result, err := model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.Text() != "Hello Ollama" {
		t.Errorf("expected 'Hello Ollama', got %q", result.Text())
	}

	if result.Usage.InputTokens != 10 || result.Usage.OutputTokens != 5 {
		t.Errorf("unexpected usage: %+v", result.Usage)
	}
}

func TestOllamaModel_GenerateText_MaxTokensStopReason(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]any{
			"done":              true,
			"done_reason":       "length",
			"prompt_eval_count": 10,
			"eval_count":        5,
			"message":           map[string]any{"role": "assistant", "content": "truncated"},
		}

		b, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(b)
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	result, err := model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.StopReason != StopReasonMaxTokens {
		t.Errorf("expected max_tokens, got %q", result.StopReason)
	}
}

func TestOllamaModel_GenerateText_HTTPError(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err == nil {
		t.Fatal("expected error for 503 response")
	}

	if !errors.Is(err, ErrOllamaGenerationFailed) {
		t.Errorf("expected ErrOllamaGenerationFailed, got %v", err)
	}
}

func TestOllamaModel_GenerateText_WithOptions(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]any

	srv := newOllamaTestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON("ok", 5, 3))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	temp := 0.5
	maxTokens := 100

	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages:    []Message{NewTextMessage(RoleUser, "hi")},
		System:      "be helpful",
		Temperature: &temp,
		MaxTokens:   maxTokens,
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if opts, ok := capturedBody["options"].(map[string]any); ok {
		if opts["temperature"] != 0.5 {
			t.Errorf("expected temperature 0.5 in options, got %v", opts["temperature"])
		}
	} else {
		t.Error("expected options in request body")
	}
}

func TestOllamaModel_CreateModel_DefaultBaseURL(t *testing.T) {
	t.Parallel()

	// Without a baseUrl property, the model should use the default.
	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		Model: "llama3",
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	// We can't easily test the default URL without hitting a real server,
	// but we can verify the model was created successfully.
	if model == nil {
		t.Fatal("expected non-nil model")
	}
}

func TestMapOllamaStreamEvent(t *testing.T) {
	t.Parallel()

	t.Run("content delta", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":false,"message":{"role":"assistant","content":"hello"}}`)
		ev := mapOllamaStreamEvent(raw)

		if ev == nil {
			t.Fatal("expected non-nil event")
		}

		if ev.Type != StreamEventContentDelta {
			t.Errorf("expected content_delta, got %q", ev.Type)
		}

		if ev.TextDelta != "hello" {
			t.Errorf("expected 'hello', got %q", ev.TextDelta)
		}
	})

	t.Run("done event with usage", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":true,"done_reason":"stop","prompt_eval_count":10,"eval_count":5}`)
		ev := mapOllamaStreamEvent(raw)

		if ev == nil {
			t.Fatal("expected non-nil done event")
		}

		if ev.Type != StreamEventMessageDone {
			t.Errorf("expected message_done, got %q", ev.Type)
		}

		if ev.Usage == nil || ev.Usage.InputTokens != 10 {
			t.Errorf("expected usage with 10 input tokens, got %+v", ev.Usage)
		}
	})

	t.Run("done with length reason", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":true,"done_reason":"length"}`)
		ev := mapOllamaStreamEvent(raw)

		if ev == nil || ev.StopReason != StopReasonMaxTokens {
			t.Errorf("expected max_tokens stop reason, got %+v", ev)
		}
	})

	t.Run("legacy response format", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":false,"response":"legacy text"}`)
		ev := mapOllamaStreamEvent(raw)

		if ev == nil {
			t.Fatal("expected non-nil event for legacy format")
		}

		if ev.TextDelta != "legacy text" {
			t.Errorf("expected 'legacy text', got %q", ev.TextDelta)
		}
	})

	t.Run("malformed JSON returns nil", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{invalid}`)
		ev := mapOllamaStreamEvent(raw)

		if ev != nil {
			t.Error("expected nil for malformed JSON")
		}
	})

	t.Run("empty content returns nil", func(t *testing.T) {
		t.Parallel()

		raw := json.RawMessage(`{"done":false,"message":{"role":"assistant","content":""}}`)
		ev := mapOllamaStreamEvent(raw)

		if ev != nil {
			t.Errorf("expected nil for empty content event, got %+v", ev)
		}
	})
}

func TestOllamaModel_StreamText_Success(t *testing.T) {
	t.Parallel()

	streamLines := `{"done":false,"message":{"role":"assistant","content":"Hello"}}
{"done":false,"message":{"role":"assistant","content":" world"}}
{"done":true,"done_reason":"stop","prompt_eval_count":10,"eval_count":5}
`

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(streamLines))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	iter, err := model.StreamText(context.Background(), &StreamTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err != nil {
		t.Fatalf("StreamText error: %v", err)
	}

	result, err := iter.Collect()
	if err != nil {
		t.Fatalf("Collect() error: %v", err)
	}

	if result.Text() != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", result.Text())
	}
}

func TestOllamaModel_GenerateText_SystemMessageRole(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON("ok", 5, 3))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	// Exercise buildOllamaMessages with a RoleSystem message in the messages array.
	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleSystem,
				Content: []ContentBlock{
					{Type: ContentBlockText, Text: "system instruction 1"},
					{Type: ContentBlockText, Text: "system instruction 2"},
				},
			},
			NewTextMessage(RoleUser, "hello"),
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOllamaModel_GenerateText_ImageAndToolRole(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON("ok", 5, 3))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	// Exercise image content and RoleTool → mapped to user role.
	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{Type: ContentBlockText, Text: "look at this"},
					{
						Type:  ContentBlockImage,
						Image: &ImagePart{URL: "https://example.com/img.jpg"},
					},
				},
			},
			{
				Role: RoleTool,
				Content: []ContentBlock{
					{Type: ContentBlockText, Text: "tool result"},
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOllamaModel_GenerateText_WithResponseFormat(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON(`{"key":"value"}`, 5, 3))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	// Exercise json_schema response format path.
	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "return JSON")},
		ResponseFormat: &ResponseFormat{
			Type:       "json_schema",
			JSONSchema: json.RawMessage(`{"type":"object"}`),
		},
		StopWords: []string{"STOP"},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOllamaModel_GenerateText_JsonObjectFormat(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(ollamaChatResponseJSON(`{"key":"value"}`, 5, 3))
	})
	defer srv.Close()

	f := NewOllamaModelFactory()
	model, err := f.CreateModel(context.Background(), ollamaConfig(srv, "llama3"))

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	// Exercise json_object response format path.
	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages:       []Message{NewTextMessage(RoleUser, "return JSON")},
		ResponseFormat: &ResponseFormat{Type: "json_object"},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}
}

func TestOllamaModel_ProcessStream_HTTPError(t *testing.T) {
	t.Parallel()

	srv := newOllamaTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	defer srv.Close()

	m := &OllamaModel{
		config:  &ConfigTarget{Model: "llama3"},
		client:  srv.Client(),
		baseURL: srv.URL,
	}

	ctx := context.Background()
	eventCh := make(chan StreamEvent, 10)

	m.processStream(ctx, map[string]any{"model": "llama3", "stream": true}, eventCh, func() {})

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	if len(events) == 0 || events[0].Type != StreamEventError {
		t.Errorf("expected error event for 500 status, got %+v", events)
	}

	if !errors.Is(events[0].Error, ErrOllamaStreamFailed) {
		t.Errorf("expected ErrOllamaStreamFailed, got %v", events[0].Error)
	}
}

func TestOllamaModel_ProcessStream_ClientError(t *testing.T) {
	t.Parallel()

	m := &OllamaModel{
		config:  &ConfigTarget{Model: "llama3"},
		client:  &http.Client{},
		baseURL: "http://127.0.0.1:1", // unreachable port
	}

	ctx := context.Background()
	eventCh := make(chan StreamEvent, 10)

	m.processStream(ctx, map[string]any{"model": "llama3", "stream": true}, eventCh, func() {})

	var events []StreamEvent
	for ev := range eventCh {
		events = append(events, ev)
	}

	if len(events) == 0 || events[0].Type != StreamEventError {
		t.Errorf("expected error event for unreachable host, got %+v", events)
	}
}

func TestOllamaModel_GenerateText_ClientError(t *testing.T) {
	t.Parallel()

	m := &OllamaModel{
		config:  &ConfigTarget{Model: "llama3"},
		client:  &http.Client{},
		baseURL: "http://127.0.0.1:1", // unreachable port
	}

	_, err := m.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err == nil {
		t.Fatal("expected error for unreachable host")
	}

	if !errors.Is(err, ErrOllamaGenerationFailed) {
		t.Errorf("expected ErrOllamaGenerationFailed, got %v", err)
	}
}

func TestJoinStrings(t *testing.T) {
	t.Parallel()

	t.Run("empty slice", func(t *testing.T) {
		t.Parallel()

		if got := joinStrings(nil, "\n"); got != "" {
			t.Errorf("expected empty string, got %q", got)
		}
	})

	t.Run("single element", func(t *testing.T) {
		t.Parallel()

		if got := joinStrings([]string{"hello"}, "\n"); got != "hello" {
			t.Errorf("expected 'hello', got %q", got)
		}
	})

	t.Run("multiple elements", func(t *testing.T) {
		t.Parallel()

		got := joinStrings([]string{"a", "b", "c"}, "-")
		if got != "a-b-c" {
			t.Errorf("expected 'a-b-c', got %q", got)
		}
	})
}
