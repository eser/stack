package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// anthropicTextResponse returns the minimal Anthropic API JSON for a text response.
func anthropicTextResponse(text, modelID string, inputTokens, outputTokens int) []byte { //nolint:unparam // test helper kept parameterised for readability
	resp := map[string]any{
		"id":            "msg_test_01",
		"type":          "message",
		"role":          "assistant",
		"model":         modelID,
		"stop_reason":   "end_turn",
		"stop_sequence": nil,
		"content": []map[string]any{
			{"type": "text", "text": text},
		},
		"usage": map[string]any{
			"input_tokens":  inputTokens,
			"output_tokens": outputTokens,
		},
	}

	b, _ := json.Marshal(resp)

	return b
}

// anthropicErrorResponse returns a JSON-encoded Anthropic API error.
func anthropicErrorResponse(statusCode int, errType, message string) []byte { //nolint:unparam // test helper kept parameterised for readability
	resp := map[string]any{
		"type": "error",
		"error": map[string]any{
			"type":    errType,
			"message": message,
		},
	}

	b, _ := json.Marshal(resp)

	return b
}

func newAnthropicTestServer(handler http.HandlerFunc) *httptest.Server {
	return httptest.NewServer(handler)
}

func TestAnthropicModelFactory_GetProvider(t *testing.T) {
	t.Parallel()

	f := NewAnthropicModelFactory()
	if f.GetProvider() != anthropicProviderName {
		t.Errorf("expected %q, got %q", anthropicProviderName, f.GetProvider())
	}
}

func TestAnthropicModelFactory_CreateModel_Validation(t *testing.T) {
	t.Parallel()

	f := NewAnthropicModelFactory()
	ctx := context.Background()

	t.Run("empty api key", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{Model: "claude-opus-4-5"})
		if !errors.Is(err, ErrInvalidAPIKey) {
			t.Errorf("expected ErrInvalidAPIKey, got %v", err)
		}
	})

	t.Run("empty model", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{APIKey: "key"})
		if !errors.Is(err, ErrInvalidModel) {
			t.Errorf("expected ErrInvalidModel, got %v", err)
		}
	})
}

func TestAnthropicModel_Metadata(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("hi", "claude-opus-4-5", 5, 2))
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel error: %v", err)
	}

	if model.GetProvider() != anthropicProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if model.GetModelID() != "claude-opus-4-5" {
		t.Errorf("wrong model ID: %s", model.GetModelID())
	}

	caps := model.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	if model.GetRawClient() == nil {
		t.Error("expected non-nil raw client")
	}

	if err := model.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestAnthropicModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("Hello world", "claude-opus-4-5", 10, 5))
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	result, err := model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.Text() != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", result.Text())
	}

	if result.StopReason != StopReasonEndTurn {
		t.Errorf("expected end_turn, got %q", result.StopReason)
	}

	if result.Usage.InputTokens != 10 || result.Usage.OutputTokens != 5 {
		t.Errorf("unexpected usage: %+v", result.Usage)
	}

	if result.ModelID != "claude-opus-4-5" {
		t.Errorf("unexpected model ID: %s", result.ModelID)
	}
}

func TestAnthropicModel_GenerateText_RateLimit(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write(anthropicErrorResponse(429, "rate_limit_error", "too many requests"))
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err == nil {
		t.Fatal("expected error for 429 response")
	}

	if !errors.Is(err, ErrAnthropicGenerationFailed) {
		t.Errorf("expected ErrAnthropicGenerationFailed in chain, got %v", err)
	}

	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("expected ErrRateLimited in chain, got %v", err)
	}
}

func TestAnthropicModel_GenerateText_AuthError(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write(anthropicErrorResponse(401, "authentication_error", "invalid api key"))
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "bad-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if !errors.Is(err, ErrAuthFailed) {
		t.Errorf("expected ErrAuthFailed in chain, got %v", err)
	}
}

func TestAnthropicModel_GenerateText_ContextCanceled(t *testing.T) {
	t.Parallel()

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
		w.WriteHeader(http.StatusGatewayTimeout)
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // immediately cancel

	_, err = model.GenerateText(ctx, &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
	})

	if err == nil {
		t.Fatal("expected error for cancelled context")
	}

	if !errors.Is(err, ErrAnthropicGenerationFailed) {
		t.Errorf("expected ErrAnthropicGenerationFailed, got %v", err)
	}
}

func TestClassifyAnthropicError_ContextCanceled(t *testing.T) {
	t.Parallel()

	err := classifyAnthropicError(ErrAnthropicGenerationFailed, context.Canceled)

	if !errors.Is(err, ErrAnthropicGenerationFailed) {
		t.Error("provider sentinel missing")
	}

	if !errors.Is(err, ErrServiceUnavailable) {
		t.Error("ErrServiceUnavailable missing for context.Canceled")
	}
}

func TestAnthropicModel_GenerateText_WithSystemPrompt(t *testing.T) {
	t.Parallel()

	var capturedBody map[string]any

	srv := newAnthropicTestServer(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(anthropicTextResponse("ok", "claude-opus-4-5", 10, 5))
	})
	defer srv.Close()

	f := NewAnthropicModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "claude-opus-4-5",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	_, err = model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hi")},
		System:   "you are a helpful assistant",
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if _, hasSystem := capturedBody["system"]; !hasSystem {
		t.Error("expected system prompt in request body")
	}
}
