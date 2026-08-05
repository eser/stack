package aifx

import (
	"errors"
	"os"
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
	Model    string `conf:"model"`    // e.g. "claude-sonnet-5"
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

// CredentialKind distinguishes the two ways a provider accepts a secret.
//
// It exists because they are not interchangeable at the transport level: an API
// key goes in a provider-specific header (Anthropic's X-Api-Key), a bearer token
// goes in Authorization. Returning a bare string loses that, and the loss is
// silent -- a token sent as an API key produces a 401 at request time instead of
// a clear error at construction time.
type CredentialKind string

const (
	// CredentialAPIKey is a provider API key.
	CredentialAPIKey CredentialKind = "api_key"

	// CredentialAuthToken is a bearer token.
	CredentialAuthToken CredentialKind = "auth_token"
)

// Credential is a resolved provider secret and the kind it is.
type Credential struct {
	Value string
	Kind  CredentialKind
}

// Found reports whether a credential was resolved at all.
func (c Credential) Found() bool { return c.Value != "" }

// credentialSource is one environment variable and what kind of secret it holds.
type credentialSource struct {
	EnvVar string
	Kind   CredentialKind
}

// credentialEnvVars lists the environment variables consulted for each provider
// when a ConfigTarget carries no API key, in the order the provider's own SDK
// consults them.
//
// The names match pkg/@eserstack/ai/detect.ts, which is what tells a user their
// provider is "available". A different name here would mean detect reports a
// provider as configured while the bridge refuses it.
var credentialEnvVars = map[string][]credentialSource{ //nolint:gochecknoglobals
	// Order and kinds taken from the pinned anthropic-sdk-go, whose
	// DefaultClientOptions documents "1. ANTHROPIC_API_KEY 2.
	// ANTHROPIC_AUTH_TOKEN" and returns on the first hit.
	"anthropic": {
		{EnvVar: "ANTHROPIC_API_KEY", Kind: CredentialAPIKey},
		{EnvVar: "ANTHROPIC_AUTH_TOKEN", Kind: CredentialAuthToken},
	},
	"openai": {{EnvVar: "OPENAI_API_KEY", Kind: CredentialAPIKey}},
	// GOOGLE_API_KEY first, matching the pinned genai SDK: with both set it
	// logs "Using GOOGLE_API_KEY". Preferring GEMINI_API_KEY here would mean a
	// machine with both exported authenticates as a different project depending
	// on whether the FFI bridge or the pure-TS path served the call.
	"gemini": {
		{EnvVar: "GOOGLE_API_KEY", Kind: CredentialAPIKey},
		{EnvVar: "GEMINI_API_KEY", Kind: CredentialAPIKey},
	},
}

// APIKeyEnvVars lists the API-key environment variables consulted per provider.
//
// Retained for callers that only care about key names. Auth-token variables are
// deliberately absent: a caller treating one as an API key is the bug Credential
// exists to prevent.
var APIKeyEnvVars = buildAPIKeyEnvVars() //nolint:gochecknoglobals

func buildAPIKeyEnvVars() map[string][]string {
	out := make(map[string][]string, len(credentialEnvVars))

	for provider, sources := range credentialEnvVars {
		for _, source := range sources {
			if source.Kind == CredentialAPIKey {
				out[provider] = append(out[provider], source.EnvVar)
			}
		}
	}

	return out
}

// ResolveCredential returns the configured secret and the kind it is.
//
// An explicitly configured ConfigTarget.APIKey always wins and is always an API
// key -- the field names the kind. Otherwise the provider's environment
// variables are consulted in the provider's own order.
//
// Reading the environment here rather than at config-decode time is deliberate:
// a long-lived process should pick up a credential exported after it started,
// which is how these are usually set.
func ResolveCredential(config *ConfigTarget) Credential {
	if config == nil {
		return Credential{Value: "", Kind: CredentialAPIKey}
	}

	if config.APIKey != "" {
		return Credential{Value: config.APIKey, Kind: CredentialAPIKey}
	}

	for _, source := range credentialEnvVars[config.Provider] {
		if value := os.Getenv(source.EnvVar); value != "" {
			return Credential{Value: value, Kind: source.Kind}
		}
	}

	return Credential{Value: "", Kind: CredentialAPIKey}
}

// ResolveAPIKey returns the configured API key, falling back to the provider's
// conventional environment variable.
//
// It reports "" for a provider authenticated only by a bearer token, because a
// token is not an API key and sending it as one 401s. Callers that can handle
// both should use ResolveCredential.
//
// The fallback exists because the two paths into these providers disagreed
// without it. The pure-TypeScript adapters omit the key entirely when it is
// unset and let the vendor SDK read its own environment variable, so they work
// with nothing configured; the FFI bridge sends `apiKey: cfg.apiKey ?? ""`, and
// an empty key was rejected outright. Which one a caller got depended on
// whether a native library happened to load.
func ResolveAPIKey(config *ConfigTarget) string {
	if credential := ResolveCredential(config); credential.Kind == CredentialAPIKey {
		return credential.Value
	}

	return ""
}
