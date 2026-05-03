package aifx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func openAITextResponse(text, modelID string, promptTokens, completionTokens int) []byte { //nolint:unparam // test helper kept parameterised for readability
	resp := map[string]any{
		"id":      "chatcmpl-test",
		"object":  "chat.completion",
		"created": 1700000000,
		"model":   modelID,
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": text,
				},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     promptTokens,
			"completion_tokens": completionTokens,
			"total_tokens":      promptTokens + completionTokens,
		},
	}

	b, _ := json.Marshal(resp)

	return b
}

func openAIErrorResponse(code int, errType, message string) []byte {
	resp := map[string]any{
		"error": map[string]any{
			"type":    errType,
			"message": message,
			"code":    code,
		},
	}

	b, _ := json.Marshal(resp)

	return b
}

func TestOpenAIModelFactory_GetProvider(t *testing.T) {
	t.Parallel()

	f := NewOpenAIModelFactory()
	if f.GetProvider() != openaiProviderName {
		t.Errorf("expected %q, got %q", openaiProviderName, f.GetProvider())
	}
}

func TestOpenAIModelFactory_CreateModel_Validation(t *testing.T) {
	t.Parallel()

	f := NewOpenAIModelFactory()
	ctx := context.Background()

	t.Run("empty api key", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{Model: "gpt-4o"})
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

func TestOpenAIModel_GenerateText_Success(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("Hello OpenAI", "gpt-4o", 10, 5))
	}))
	defer srv.Close()

	f := NewOpenAIModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "gpt-4o",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	if model.GetProvider() != openaiProviderName {
		t.Errorf("wrong provider: %s", model.GetProvider())
	}

	if model.GetModelID() != "gpt-4o" {
		t.Errorf("wrong model ID: %s", model.GetModelID())
	}

	result, err := model.GenerateText(context.Background(), &GenerateTextOptions{
		Messages: []Message{NewTextMessage(RoleUser, "hello")},
	})

	if err != nil {
		t.Fatalf("GenerateText error: %v", err)
	}

	if result.Text() != "Hello OpenAI" {
		t.Errorf("expected 'Hello OpenAI', got %q", result.Text())
	}
}

func TestOpenAIModel_GenerateText_RateLimit(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write(openAIErrorResponse(429, "rate_limit_exceeded", "too many requests"))
	}))
	defer srv.Close()

	f := NewOpenAIModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "gpt-4o",
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

	if !errors.Is(err, ErrOpenAIGenerationFailed) {
		t.Errorf("expected ErrOpenAIGenerationFailed, got %v", err)
	}

	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("expected ErrRateLimited in chain, got %v", err)
	}
}

func TestOpenAIModel_Metadata(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(openAITextResponse("ok", "gpt-4o", 1, 1))
	}))
	defer srv.Close()

	f := NewOpenAIModelFactory()
	model, err := f.CreateModel(context.Background(), &ConfigTarget{
		APIKey:  "test-key",
		Model:   "gpt-4o",
		BaseURL: srv.URL,
	})

	if err != nil {
		t.Fatalf("CreateModel: %v", err)
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

func TestClassifyOpenAIError_ContextCanceled(t *testing.T) {
	t.Parallel()

	err := classifyOpenAIError(ErrOpenAIGenerationFailed, context.Canceled)

	if !errors.Is(err, ErrOpenAIGenerationFailed) {
		t.Error("provider sentinel missing")
	}

	if !errors.Is(err, ErrServiceUnavailable) {
		t.Error("ErrServiceUnavailable missing for context.Canceled")
	}
}
