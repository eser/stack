package aifx

import (
	"context"
	"errors"
	"testing"
)

func TestGeminiModelFactory_GetProvider(t *testing.T) {
	t.Parallel()

	f := NewGeminiModelFactory()
	if f.GetProvider() != geminiProviderName {
		t.Errorf("expected %q, got %q", geminiProviderName, f.GetProvider())
	}
}

func TestGeminiModelFactory_CreateModel_Validation(t *testing.T) {
	t.Parallel()

	f := NewGeminiModelFactory()
	ctx := context.Background()

	t.Run("empty api key", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{Model: "gemini-2.0-flash"})
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

func TestGeminiModelFactory_Capabilities(t *testing.T) {
	t.Parallel()

	caps := geminiCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}
}

func TestVertexAIModelFactory_GetProvider(t *testing.T) {
	t.Parallel()

	f := NewVertexAIModelFactory()
	if f.GetProvider() != vertexAIProviderName {
		t.Errorf("expected %q, got %q", vertexAIProviderName, f.GetProvider())
	}
}

func TestVertexAIModelFactory_CreateModel_Validation(t *testing.T) {
	t.Parallel()

	f := NewVertexAIModelFactory()
	ctx := context.Background()

	t.Run("missing project ID", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{
			Location: "us-central1",
			Model:    "gemini-2.0-flash",
		})

		if !errors.Is(err, ErrVertexAIProjectMissing) {
			t.Errorf("expected ErrVertexAIProjectMissing, got %v", err)
		}
	})

	t.Run("missing location", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{
			ProjectID: "my-project",
			Model:     "gemini-2.0-flash",
		})

		if !errors.Is(err, ErrVertexAILocationMissing) {
			t.Errorf("expected ErrVertexAILocationMissing, got %v", err)
		}
	})

	t.Run("missing model", func(t *testing.T) {
		t.Parallel()

		_, err := f.CreateModel(ctx, &ConfigTarget{
			ProjectID: "my-project",
			Location:  "us-central1",
		})

		if !errors.Is(err, ErrInvalidModel) {
			t.Errorf("expected ErrInvalidModel, got %v", err)
		}
	})
}

func TestVertexAIModelFactory_Capabilities(t *testing.T) {
	t.Parallel()

	caps := vertexAICapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}
}

func TestClassifyGeminiError_ContextCanceled(t *testing.T) {
	t.Parallel()

	err := classifyGeminiError(ErrGeminiGenerationFailed, context.Canceled)

	if !errors.Is(err, ErrGeminiGenerationFailed) {
		t.Error("provider sentinel missing")
	}

	if !errors.Is(err, ErrServiceUnavailable) {
		t.Error("ErrServiceUnavailable missing for context.Canceled")
	}
}

func TestClassifyVertexAIError_ContextDeadlineExceeded(t *testing.T) {
	t.Parallel()

	err := classifyVertexAIError(ErrVertexAIGenerationFailed, context.DeadlineExceeded)

	if !errors.Is(err, ErrVertexAIGenerationFailed) {
		t.Error("provider sentinel missing")
	}

	if !errors.Is(err, ErrServiceUnavailable) {
		t.Error("ErrServiceUnavailable missing for deadline exceeded")
	}
}

func TestGeminiModel_MethodsWithNilClient(t *testing.T) {
	t.Parallel()

	// GeminiModel can be constructed with a nil client to test non-network methods.
	m := &GeminiModel{client: nil, modelID: "gemini-2.0-flash"}

	if m.GetProvider() != geminiProviderName {
		t.Errorf("expected %q, got %q", geminiProviderName, m.GetProvider())
	}

	if m.GetModelID() != "gemini-2.0-flash" {
		t.Errorf("expected 'gemini-2.0-flash', got %q", m.GetModelID())
	}

	caps := m.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	// GetRawClient returns the (nil) client pointer — should not panic.
	_ = m.GetRawClient()

	if err := m.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestVertexAIModel_MethodsWithNilClient(t *testing.T) {
	t.Parallel()

	m := &VertexAIModel{client: nil, modelID: "gemini-2.0-flash"}

	if m.GetProvider() != vertexAIProviderName {
		t.Errorf("expected %q, got %q", vertexAIProviderName, m.GetProvider())
	}

	if m.GetModelID() != "gemini-2.0-flash" {
		t.Errorf("expected 'gemini-2.0-flash', got %q", m.GetModelID())
	}

	caps := m.GetCapabilities()
	if len(caps) == 0 {
		t.Error("expected non-empty capabilities")
	}

	_ = m.GetRawClient()

	if err := m.Close(context.Background()); err != nil {
		t.Errorf("Close() error: %v", err)
	}
}

func TestClassifyGeminiError_NetworkError(t *testing.T) {
	t.Parallel()

	err := classifyGeminiError(ErrGeminiGenerationFailed, errors.New("network timeout"))

	if !errors.Is(err, ErrGeminiGenerationFailed) {
		t.Error("provider sentinel missing")
	}
}

func TestClassifyVertexAIError_NetworkError(t *testing.T) {
	t.Parallel()

	err := classifyVertexAIError(ErrVertexAIGenerationFailed, errors.New("connection refused"))

	if !errors.Is(err, ErrVertexAIGenerationFailed) {
		t.Error("provider sentinel missing")
	}
}

func TestNewAudioMessage(t *testing.T) {
	t.Parallel()

	msg := NewAudioMessage(RoleUser, "https://example.com/audio.mp3")

	if msg.Role != RoleUser {
		t.Errorf("expected user role, got %q", msg.Role)
	}

	if len(msg.Content) != 1 {
		t.Fatalf("expected 1 content block, got %d", len(msg.Content))
	}

	if msg.Content[0].Type != ContentBlockAudio {
		t.Errorf("expected audio content block, got %q", msg.Content[0].Type)
	}

	if msg.Content[0].Audio == nil || msg.Content[0].Audio.URL != "https://example.com/audio.mp3" {
		t.Errorf("expected audio URL, got %+v", msg.Content[0].Audio)
	}
}

func TestNewRegistry_WithOption(t *testing.T) {
	t.Parallel()

	var called bool
	r := NewRegistry(func(registry *Registry) {
		called = true
		_ = registry
	})

	if !called {
		t.Error("expected option function to be called")
	}

	if r == nil {
		t.Error("expected non-nil registry")
	}
}

func TestNewRegistry_WithLogger(t *testing.T) {
	t.Parallel()

	r := NewRegistry(WithLogger(nil))

	if r == nil {
		t.Fatal("expected non-nil registry")
	}
}

func TestNewRegistry_WithDefaultFactories(t *testing.T) {
	t.Parallel()

	r := NewRegistry(WithDefaultFactories())

	if r == nil {
		t.Fatal("expected non-nil registry")
	}
}
