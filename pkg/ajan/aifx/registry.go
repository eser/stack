package aifx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
)

var (
	ErrModelNotFound       = errors.New("model not found")
	ErrModelAlreadyExists  = errors.New("model already exists")
	ErrFailedToCreateModel = errors.New("failed to create model")
	ErrUnsupportedProvider = errors.New("unsupported provider")
	ErrFailedToCloseModels = errors.New("failed to close models")
	ErrFailedToAddModel    = errors.New("failed to add model")
)

const DefaultModel = "default"

// Registry manages all AI language models in the system.
type Registry struct {
	models    map[string]LanguageModel
	factories map[string]ProviderFactory // provider -> factory
	logger    Logger
	mu        sync.RWMutex
}

// NewRegistry creates a new AI model registry.
func NewRegistry(options ...NewRegistryOption) *Registry {
	registry := &Registry{
		models:    make(map[string]LanguageModel),
		factories: make(map[string]ProviderFactory),
		logger:    slog.Default(),
		mu:        sync.RWMutex{},
	}

	for _, option := range options {
		option(registry)
	}

	return registry
}

// RegisterFactory registers a provider factory.
func (registry *Registry) RegisterFactory(factory ProviderFactory) {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	provider := factory.GetProvider()

	registry.factories[provider] = factory
}

// GetDefault returns the default model.
func (registry *Registry) GetDefault() LanguageModel { //nolint:ireturn
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	return registry.models[DefaultModel]
}

// GetNamed returns a named model.
func (registry *Registry) GetNamed(name string) LanguageModel { //nolint:ireturn
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	return registry.models[name]
}

// GetByProvider returns all models from a specific provider.
func (registry *Registry) GetByProvider(provider string) []LanguageModel {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	var models []LanguageModel
	for _, model := range registry.models {
		if model.GetProvider() == provider {
			models = append(models, model)
		}
	}

	return models
}

// GetByCapability returns all models with a specific capability.
func (registry *Registry) GetByCapability(capability ProviderCapability) []LanguageModel {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	var models []LanguageModel
	for _, model := range registry.models {
		if slices.Contains(model.GetCapabilities(), capability) {
			models = append(models, model)
		}
	}

	return models
}

// ListModels returns all registered model names.
func (registry *Registry) ListModels() []string {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	names := make([]string, 0, len(registry.models))
	for name := range registry.models {
		names = append(names, name)
	}

	return names
}

// ListRegisteredProviders returns all registered provider names.
func (registry *Registry) ListRegisteredProviders() []string {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	providers := make([]string, 0, len(registry.factories))
	for provider := range registry.factories {
		providers = append(providers, provider)
	}

	return providers
}

// AddModel creates and registers a new model.
func (registry *Registry) AddModel( //nolint:ireturn
	ctx context.Context,
	name string,
	config *ConfigTarget,
) (LanguageModel, error) {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	// Check if model already exists
	if _, exists := registry.models[name]; exists {
		return nil, fmt.Errorf("%w (name=%q)", ErrModelAlreadyExists, name)
	}

	// Get factory for this provider
	factory, exists := registry.factories[config.Provider]
	if !exists {
		return nil, fmt.Errorf("%w (provider=%q)", ErrUnsupportedProvider, config.Provider)
	}

	registry.logger.DebugContext(
		ctx,
		"creating AI model",
		slog.String("name", name),
		slog.String("provider", config.Provider),
		slog.String("model", config.Model),
	)

	// Create the model
	model, err := factory.CreateModel(ctx, config)
	if err != nil {
		registry.logger.ErrorContext(
			ctx,
			"failed to create AI model",
			slog.String("error", err.Error()),
			slog.String("name", name),
			slog.String("provider", config.Provider),
		)

		return nil, fmt.Errorf("%w (name=%q): %w", ErrFailedToCreateModel, name, err)
	}

	registry.models[name] = model

	registry.logger.DebugContext(
		ctx,
		"successfully added AI model",
		slog.String("name", name),
		slog.String("provider", config.Provider),
		slog.String("model", config.Model),
	)

	return model, nil
}

// RemoveModel removes a model from the registry.
func (registry *Registry) RemoveModel(ctx context.Context, name string) error {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	model, exists := registry.models[name]
	if !exists {
		return fmt.Errorf("%w (name=%q)", ErrModelNotFound, name)
	}

	// Close the model
	err := model.Close(ctx)
	if err != nil {
		registry.logger.WarnContext(
			ctx,
			"error closing AI model",
			slog.String("error", err.Error()),
			slog.String("name", name),
		)
	}

	delete(registry.models, name)

	registry.logger.DebugContext(
		ctx,
		"removed AI model",
		slog.String("name", name),
	)

	return nil
}

// LoadFromConfig creates models from configuration.
func (registry *Registry) LoadFromConfig(ctx context.Context, config *Config) error {
	for name, target := range config.Targets {
		_, err := registry.AddModel(ctx, name, &target)
		if err != nil {
			return fmt.Errorf("%w (name=%q): %w", ErrFailedToAddModel, name, err)
		}
	}

	return nil
}

// Close closes all models in the registry.
func (registry *Registry) Close(ctx context.Context) error {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	var errs []error

	for name, model := range registry.models {
		err := model.Close(ctx)
		if err != nil {
			errs = append(
				errs,
				fmt.Errorf("failed to close model (name=%q): %w", name, err),
			)
		}
	}

	// Clear the models map
	registry.models = make(map[string]LanguageModel)

	if len(errs) > 0 {
		errStrs := make([]string, len(errs))
		for i, err := range errs {
			errStrs[i] = err.Error()
		}

		errMsg := strings.Join(errStrs, "; ")

		return fmt.Errorf("%w: %s", ErrFailedToCloseModels, errMsg)
	}

	return nil
}
