package aifx

import (
	"errors"
	"time"
)

var (
	ErrInvalidProvider = errors.New("invalid provider")
	ErrInvalidAPIKey   = errors.New("invalid API key")
	ErrInvalidModel    = errors.New("invalid model")
)

// Config represents the main configuration for aifx.
type Config struct {
	Targets map[string]ConfigTarget `conf:"targets"`
}

// ConfigTarget represents the configuration data for an AI model.
type ConfigTarget struct {
	// Properties carries provider-specific configuration.
	// Vertex AI: "service_account" (base64), "service_account_file", "batch_bucket", "project_number"
	// OpenAI: "expose_internal_errors"
	Properties map[string]any `conf:"properties"`

	Provider string `conf:"provider"` // "anthropic", "openai", "gemini", "vertexai"
	APIKey   string `conf:"api_key"`
	Model    string `conf:"model"`    // e.g. "claude-sonnet-4-20250514"
	BaseURL  string `conf:"base_url"` // custom endpoints/proxies

	// Vertex AI specific
	ProjectID string `conf:"project_id"`
	Location  string `conf:"location"`

	// Generation defaults
	MaxTokens   int     `conf:"max_tokens"  default:"1024"`
	Temperature float64 `conf:"temperature" default:"0.7"`

	// RequestTimeout sets the per-request timeout for AI SDK calls.
	RequestTimeout time.Duration `conf:"request_timeout" default:"60s"`
}
