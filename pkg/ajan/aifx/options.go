package aifx

// NewRegistryOption defines functional options for Registry.
type NewRegistryOption func(*Registry)

// WithLogger sets the logger for the registry.
func WithLogger(logger Logger) NewRegistryOption {
	return func(r *Registry) {
		r.logger = logger
	}
}

// WithDefaultFactories registers all built-in provider factories.
func WithDefaultFactories() NewRegistryOption {
	return func(r *Registry) {
		r.RegisterFactory(NewAnthropicModelFactory())
		r.RegisterFactory(NewOpenAIModelFactory())
		r.RegisterFactory(NewGeminiModelFactory())
		r.RegisterFactory(NewVertexAIModelFactory())
	}
}
