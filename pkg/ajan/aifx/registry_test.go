package aifx_test

import (
	"context"
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

// mockModel is a minimal LanguageModel implementation for registry tests.
type mockModel struct {
	provider     string
	modelID      string
	capabilities []aifx.ProviderCapability
	rawClient    any
	closeErr     error
}

func (m *mockModel) GetCapabilities() []aifx.ProviderCapability { return m.capabilities }
func (m *mockModel) GetProvider() string                        { return m.provider }
func (m *mockModel) GetModelID() string                         { return m.modelID }
func (m *mockModel) GetRawClient() any                          { return m.rawClient }
func (m *mockModel) Close(_ context.Context) error              { return m.closeErr }

func (m *mockModel) GenerateText(_ context.Context, _ *aifx.GenerateTextOptions) (*aifx.GenerateTextResult, error) {
	return &aifx.GenerateTextResult{}, nil
}

func (m *mockModel) StreamText(_ context.Context, _ *aifx.StreamTextOptions) (*aifx.StreamIterator, error) {
	ch := make(chan aifx.StreamEvent)
	close(ch)

	return aifx.NewStreamIterator(ch, func() {}), nil
}

// mockFactory creates mockModel instances for a given provider.
type mockFactory struct {
	provider      string
	createErr     error
	modelToReturn *mockModel
}

func (f *mockFactory) GetProvider() string { return f.provider }

func (f *mockFactory) CreateModel(_ context.Context, _ *aifx.ConfigTarget) (aifx.LanguageModel, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}

	if f.modelToReturn != nil {
		return f.modelToReturn, nil
	}

	return &mockModel{provider: f.provider, modelID: "mock-model"}, nil
}

func TestRegistry_RegisterFactory(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()

	r.RegisterFactory(&mockFactory{provider: "test"})

	providers := r.ListRegisteredProviders()
	if len(providers) != 1 || providers[0] != "test" {
		t.Errorf("expected [test], got %v", providers)
	}
}

func TestRegistry_AddModel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		setup       func(*aifx.Registry)
		modelName   string
		config      *aifx.ConfigTarget
		wantErr     error
		wantSuccess bool
	}{
		{
			name: "success",
			setup: func(r *aifx.Registry) {
				r.RegisterFactory(&mockFactory{provider: "mock"})
			},
			modelName:   "my-model",
			config:      &aifx.ConfigTarget{Provider: "mock", Model: "x"},
			wantSuccess: true,
		},
		{
			name:      "unsupported provider",
			setup:     func(_ *aifx.Registry) {},
			modelName: "bad",
			config:    &aifx.ConfigTarget{Provider: "unknown"},
			wantErr:   aifx.ErrUnsupportedProvider,
		},
		{
			name: "duplicate name",
			setup: func(r *aifx.Registry) {
				r.RegisterFactory(&mockFactory{provider: "mock"})
				_, _ = r.AddModel(context.Background(), "dupe", &aifx.ConfigTarget{Provider: "mock"})
			},
			modelName: "dupe",
			config:    &aifx.ConfigTarget{Provider: "mock"},
			wantErr:   aifx.ErrModelAlreadyExists,
		},
		{
			name: "factory create error",
			setup: func(r *aifx.Registry) {
				r.RegisterFactory(&mockFactory{provider: "mock", createErr: errors.New("boom")})
			},
			modelName: "err-model",
			config:    &aifx.ConfigTarget{Provider: "mock"},
			wantErr:   aifx.ErrFailedToCreateModel,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			r := aifx.NewRegistry()
			tc.setup(r)

			model, err := r.AddModel(context.Background(), tc.modelName, tc.config)

			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Errorf("expected error %v, got %v", tc.wantErr, err)
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if model == nil {
				t.Fatal("expected non-nil model")
			}
		})
	}
}

func TestRegistry_GetNamed(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{provider: "mock"})

	_, _ = r.AddModel(context.Background(), "my-model", &aifx.ConfigTarget{Provider: "mock"})

	if r.GetNamed("my-model") == nil {
		t.Fatal("expected model, got nil")
	}

	if r.GetNamed("nonexistent") != nil {
		t.Fatal("expected nil for unknown name")
	}
}

func TestRegistry_GetDefault(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{provider: "mock"})

	if r.GetDefault() != nil {
		t.Fatal("default should be nil before registration")
	}

	_, _ = r.AddModel(context.Background(), aifx.DefaultModel, &aifx.ConfigTarget{Provider: "mock"})

	if r.GetDefault() == nil {
		t.Fatal("expected default model after adding one with DefaultModel name")
	}
}

func TestRegistry_ListModels(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{provider: "mock"})

	_, _ = r.AddModel(context.Background(), "a", &aifx.ConfigTarget{Provider: "mock"})
	_, _ = r.AddModel(context.Background(), "b", &aifx.ConfigTarget{Provider: "mock"})

	names := r.ListModels()
	if len(names) != 2 {
		t.Errorf("expected 2 models, got %d", len(names))
	}
}

func TestRegistry_GetByProvider(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{
		provider:      "provider-a",
		modelToReturn: &mockModel{provider: "provider-a"},
	})
	r.RegisterFactory(&mockFactory{
		provider:      "provider-b",
		modelToReturn: &mockModel{provider: "provider-b"},
	})

	_, _ = r.AddModel(context.Background(), "m1", &aifx.ConfigTarget{Provider: "provider-a"})
	_, _ = r.AddModel(context.Background(), "m2", &aifx.ConfigTarget{Provider: "provider-a"})
	_, _ = r.AddModel(context.Background(), "m3", &aifx.ConfigTarget{Provider: "provider-b"})

	results := r.GetByProvider("provider-a")
	if len(results) != 2 {
		t.Errorf("expected 2 models for provider-a, got %d", len(results))
	}
}

func TestRegistry_GetByCapability(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{
		provider: "mock",
		modelToReturn: &mockModel{
			provider:     "mock",
			capabilities: []aifx.ProviderCapability{aifx.CapabilityStreaming},
		},
	})

	_, _ = r.AddModel(context.Background(), "streaming", &aifx.ConfigTarget{Provider: "mock"})

	results := r.GetByCapability(aifx.CapabilityStreaming)
	if len(results) != 1 {
		t.Errorf("expected 1 model with streaming, got %d", len(results))
	}

	results = r.GetByCapability(aifx.CapabilityVision)
	if len(results) != 0 {
		t.Errorf("expected 0 models with vision, got %d", len(results))
	}
}

func TestRegistry_RemoveModel(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{provider: "mock"})

	_, _ = r.AddModel(context.Background(), "m", &aifx.ConfigTarget{Provider: "mock"})

	if err := r.RemoveModel(context.Background(), "m"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if r.GetNamed("m") != nil {
		t.Fatal("model should be gone after Remove")
	}

	err := r.RemoveModel(context.Background(), "nonexistent")
	if !errors.Is(err, aifx.ErrModelNotFound) {
		t.Errorf("expected ErrModelNotFound, got %v", err)
	}
}

func TestRegistry_Close(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{provider: "mock"})

	_, _ = r.AddModel(context.Background(), "a", &aifx.ConfigTarget{Provider: "mock"})
	_, _ = r.AddModel(context.Background(), "b", &aifx.ConfigTarget{Provider: "mock"})

	if err := r.Close(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(r.ListModels()) != 0 {
		t.Fatal("models should be cleared after Close")
	}
}

func TestRegistry_Close_PropagatesErrors(t *testing.T) {
	t.Parallel()

	r := aifx.NewRegistry()
	r.RegisterFactory(&mockFactory{
		provider:      "mock",
		modelToReturn: &mockModel{provider: "mock", closeErr: errors.New("close failed")},
	})

	_, _ = r.AddModel(context.Background(), "bad", &aifx.ConfigTarget{Provider: "mock"})

	err := r.Close(context.Background())
	if !errors.Is(err, aifx.ErrFailedToCloseModels) {
		t.Errorf("expected ErrFailedToCloseModels, got %v", err)
	}
}

type fakeSDKClient struct{ name string }

func TestGetTypedClient(t *testing.T) {
	t.Parallel()

	t.Run("nil registry", func(t *testing.T) {
		t.Parallel()

		_, err := aifx.GetTypedClient[*fakeSDKClient](nil, "default")
		if !errors.Is(err, aifx.ErrRegistryIsNil) {
			t.Errorf("expected ErrRegistryIsNil, got %v", err)
		}
	})

	t.Run("model not found", func(t *testing.T) {
		t.Parallel()

		r := aifx.NewRegistry()
		_, err := aifx.GetTypedClient[*fakeSDKClient](r, "missing")

		if !errors.Is(err, aifx.ErrModelNotFound) {
			t.Errorf("expected ErrModelNotFound, got %v", err)
		}
	})

	t.Run("raw client is nil", func(t *testing.T) {
		t.Parallel()

		r := aifx.NewRegistry()
		r.RegisterFactory(&mockFactory{
			provider:      "mock",
			modelToReturn: &mockModel{provider: "mock", rawClient: nil},
		})
		_, _ = r.AddModel(context.Background(), "m", &aifx.ConfigTarget{Provider: "mock"})

		_, err := aifx.GetTypedClient[*fakeSDKClient](r, "m")
		if !errors.Is(err, aifx.ErrRawClientIsNil) {
			t.Errorf("expected ErrRawClientIsNil, got %v", err)
		}
	})

	t.Run("type mismatch", func(t *testing.T) {
		t.Parallel()

		r := aifx.NewRegistry()
		r.RegisterFactory(&mockFactory{
			provider:      "mock",
			modelToReturn: &mockModel{provider: "mock", rawClient: "not-a-pointer"},
		})
		_, _ = r.AddModel(context.Background(), "m", &aifx.ConfigTarget{Provider: "mock"})

		_, err := aifx.GetTypedClient[*fakeSDKClient](r, "m")
		if !errors.Is(err, aifx.ErrInvalidType) {
			t.Errorf("expected ErrInvalidType, got %v", err)
		}
	})

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		raw := &fakeSDKClient{name: "sdk"}
		r := aifx.NewRegistry()
		r.RegisterFactory(&mockFactory{
			provider:      "mock",
			modelToReturn: &mockModel{provider: "mock", rawClient: raw},
		})
		_, _ = r.AddModel(context.Background(), "m", &aifx.ConfigTarget{Provider: "mock"})

		got, err := aifx.GetTypedClient[*fakeSDKClient](r, "m")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if got != raw {
			t.Error("expected same raw client pointer")
		}
	})
}
