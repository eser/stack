package aifx

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"testing"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// The property under test: a provider configured with no API key still works if
// the conventional environment variable is set.
//
// Without it the two paths into these providers disagreed. The pure-TypeScript
// adapters omit the key when unset and let the vendor SDK read its own
// environment variable; the FFI bridge sends `apiKey: ""` and Go rejected it
// outright. Which behaviour a caller got depended on whether a native library
// happened to load — a difference nothing reported.

func TestResolveAPIKeyPrefersTheConfiguredKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "from-env")

	got := ResolveAPIKey(&ConfigTarget{ //nolint:exhaustruct
		Provider: "anthropic",
		APIKey:   "from-config",
	})

	if got != "from-config" {
		t.Fatalf("resolved %q; an explicit key must win over the environment", got)
	}
}

func TestResolveAPIKeyFallsBackToTheEnvironment(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "from-env")
	t.Setenv("OPENAI_API_KEY", "openai-env")

	for provider, want := range map[string]string{
		"anthropic": "from-env",
		"openai":    "openai-env",
	} {
		got := ResolveAPIKey(&ConfigTarget{Provider: provider}) //nolint:exhaustruct
		if got != want {
			t.Fatalf("%s resolved %q, want %q", provider, got, want)
		}
	}
}

// Gemini accepts either name, and detect.ts reports it available on either, so
// the fallback has to cover both or detect would call the provider configured
// while the factory refused it.
//
// The ORDER matters and is not arbitrary: the pinned genai SDK logs "Using
// GOOGLE_API_KEY" when both are set. Preferring GEMINI_API_KEY here would make
// a machine with both exported authenticate as a different project depending on
// whether the FFI bridge or the pure-TS path served the call.
func TestResolveAPIKeyAcceptsEitherGeminiName(t *testing.T) {
	t.Setenv("GOOGLE_API_KEY", "")
	t.Setenv("GEMINI_API_KEY", "gemini-env")

	if got := ResolveAPIKey(&ConfigTarget{Provider: "gemini"}); got != "gemini-env" { //nolint:exhaustruct
		t.Fatalf("resolved %q, want the GEMINI_API_KEY fallback", got)
	}

	t.Setenv("GOOGLE_API_KEY", "google-env")

	if got := ResolveAPIKey(&ConfigTarget{Provider: "gemini"}); got != "google-env" { //nolint:exhaustruct
		t.Fatalf("resolved %q; GOOGLE_API_KEY must win, as the SDK does", got)
	}
}

// A provider with no convention, and no key anywhere, must still resolve to
// empty so the factory can reject it with a clear error.
func TestResolveAPIKeyStaysEmptyWhenNothingIsSet(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "")

	if got := ResolveAPIKey(&ConfigTarget{Provider: "anthropic"}); got != "" { //nolint:exhaustruct
		t.Fatalf("resolved %q with nothing configured", got)
	}

	if got := ResolveAPIKey(&ConfigTarget{Provider: "kiro"}); got != "" { //nolint:exhaustruct
		t.Fatalf("a provider with no env convention resolved %q", got)
	}

	if got := ResolveAPIKey(nil); got != "" {
		t.Fatalf("nil config resolved %q", got)
	}
}

// The end-to-end version: the factory itself must accept an environment key.
func TestFactoryAcceptsAnEnvironmentKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "env-key")

	_, err := NewAnthropicModelFactory().CreateModel(
		context.Background(),
		&ConfigTarget{Provider: "anthropic", Model: "claude-test"}, //nolint:exhaustruct
	)
	if err != nil {
		t.Fatalf("factory rejected a config whose key is in the environment: %v", err)
	}
}

// And still rejects when there is genuinely no key, rather than constructing a
// client that will fail later with something less obvious.
func TestFactoryStillRejectsAMissingKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	// Both, or this fails on any machine that exports a token.
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "")

	_, err := NewAnthropicModelFactory().CreateModel(
		context.Background(),
		&ConfigTarget{Provider: "anthropic", Model: "claude-test"}, //nolint:exhaustruct
	)

	if !errors.Is(err, ErrInvalidAPIKey) {
		t.Fatalf("error = %v, want ErrInvalidAPIKey", err)
	}
}

// TestAuthTokenIsResolvedAsATokenNotAKey pins the distinction the whole
// Credential type exists for.
//
// A bearer token sent as an API key goes in X-Api-Key and 401s at request time,
// which reads as a bad credential rather than as the wrong header. Simply
// appending ANTHROPIC_AUTH_TOKEN to the API-key list would do exactly that —
// trading today's clear construction-time error for an opaque runtime failure.
func TestAuthTokenIsResolvedAsATokenNotAKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "bearer-abc")

	credential := ResolveCredential(&ConfigTarget{Provider: "anthropic"}) //nolint:exhaustruct

	if credential.Value != "bearer-abc" {
		t.Fatalf("value = %q, want the auth token", credential.Value)
	}

	if credential.Kind != CredentialAuthToken {
		t.Fatalf("kind = %q, want auth_token", credential.Kind)
	}

	// And it must NOT masquerade as an API key for callers that only handle keys.
	if got := ResolveAPIKey(&ConfigTarget{Provider: "anthropic"}); got != "" { //nolint:exhaustruct
		t.Fatalf("ResolveAPIKey returned a bearer token as a key: %q", got)
	}
}

// The SDK documents "1. ANTHROPIC_API_KEY 2. ANTHROPIC_AUTH_TOKEN" and returns
// on the first hit. Diverging here would authenticate differently depending on
// whether the bridge or the pure-TS path served the call.
func TestAPIKeyWinsOverAuthToken(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "key-abc")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "bearer-abc")

	credential := ResolveCredential(&ConfigTarget{Provider: "anthropic"}) //nolint:exhaustruct

	if credential.Value != "key-abc" || credential.Kind != CredentialAPIKey {
		t.Fatalf("resolved %+v, want the API key", credential)
	}
}

// An explicitly configured key names its own kind and must win over both.
func TestConfiguredKeyIsAlwaysAnAPIKey(t *testing.T) {
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "bearer-abc")

	credential := ResolveCredential(&ConfigTarget{ //nolint:exhaustruct
		Provider: "anthropic",
		APIKey:   "explicit",
	})

	if credential.Value != "explicit" || credential.Kind != CredentialAPIKey {
		t.Fatalf("resolved %+v, want the configured key", credential)
	}
}

// A machine with only an auth token must now construct a client instead of
// being refused.
func TestFactoryAcceptsAnAuthToken(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "bearer-abc")

	if _, err := NewAnthropicModelFactory().CreateModel(
		context.Background(),
		&ConfigTarget{Provider: "anthropic", Model: "claude-test"}, //nolint:exhaustruct
	); err != nil {
		t.Fatalf("factory refused a machine authenticated by auth token: %v", err)
	}
}

// APIKeyEnvVars must not start advertising token variables: a caller reading it
// to find "the API key" would pick up a bearer token.
func TestAPIKeyEnvVarsExcludesTokenVariables(t *testing.T) {
	t.Parallel()

	for _, name := range APIKeyEnvVars["anthropic"] {
		if name == "ANTHROPIC_AUTH_TOKEN" {
			t.Fatal("APIKeyEnvVars advertises a bearer-token variable as an API key")
		}
	}

	if len(APIKeyEnvVars["anthropic"]) != 1 {
		t.Fatalf("anthropic API-key vars = %v, want just ANTHROPIC_API_KEY",
			APIKeyEnvVars["anthropic"])
	}
}

// capturingTransport records the request the SDK actually sent.
type capturingTransport struct {
	header http.Header
	url    *url.URL
}

func (t *capturingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.header = req.Header.Clone()
	t.url = req.URL

	return nil, errCaptured
}

var errCaptured = errors.New("captured")

// TestCredentialReachesTheRightHeader is the assertion the branch alone cannot
// make.
//
// Testing that credentialOption returns a different option per kind proves
// nothing: what matters is which HEADER the SDK ends up sending. A bearer token
// in X-Api-Key does not fail loudly — it 401s at request time, which reads as a
// bad credential rather than as the wrong header, and that is exactly the
// failure this routing exists to prevent.
func TestCredentialReachesTheRightHeader(t *testing.T) {
	cases := []struct {
		credential Credential
		wantHeader string
		wantValue  string
		absent     string
	}{
		{
			credential: Credential{Value: "key-abc", Kind: CredentialAPIKey},
			wantHeader: "X-Api-Key",
			wantValue:  "key-abc",
			absent:     "Authorization",
		},
		{
			credential: Credential{Value: "tok-abc", Kind: CredentialAuthToken},
			wantHeader: "Authorization",
			wantValue:  "Bearer tok-abc",
			absent:     "X-Api-Key",
		},
	}

	for _, tc := range cases {
		transport := &capturingTransport{} //nolint:exhaustruct

		// Through the production option list, and with the environment cleared.
		// Built by hand this test leaked: anthropic.NewClient prepends its own
		// env credential chain, so an exported ANTHROPIC_API_KEY put X-Api-Key on
		// the auth_token case and the assertion failed for a reason that had
		// nothing to do with the routing under test.
		t.Setenv("ANTHROPIC_API_KEY", "")
		t.Setenv("ANTHROPIC_AUTH_TOKEN", "")

		opts := append(
			anthropicClientOptions(&ConfigTarget{Provider: "anthropic"}, tc.credential), //nolint:exhaustruct
			option.WithHTTPClient(&http.Client{Transport: transport}),                   //nolint:exhaustruct
			option.WithMaxRetries(0),
		)

		client := anthropic.NewClient(opts...)

		// The call is expected to fail at the transport; the request is the point.
		_, _ = client.Messages.New(context.Background(), anthropic.MessageNewParams{ //nolint:exhaustruct
			Model:     "claude-test",
			MaxTokens: 1,
			Messages:  []anthropic.MessageParam{anthropic.NewUserMessage(anthropic.NewTextBlock("hi"))},
		})

		if transport.header == nil {
			t.Fatalf("%s: no request was sent", tc.credential.Kind)
		}

		if got := transport.header.Get(tc.wantHeader); got != tc.wantValue {
			t.Fatalf("%s: %s = %q, want %q",
				tc.credential.Kind, tc.wantHeader, got, tc.wantValue)
		}

		if got := transport.header.Get(tc.absent); got != "" {
			t.Fatalf("%s: credential also leaked into %s as %q",
				tc.credential.Kind, tc.absent, got)
		}
	}
}

// TestNoAmbientCredentialIsSent pins that only the credential this package
// resolved reaches the network.
//
// It drives anthropicClientOptions — the list CreateModel actually uses. An
// earlier version of this test rebuilt the options by hand and therefore passed
// against a factory with the guard removed, which is the failure mode it exists
// to catch.
func TestNoAmbientCredentialIsSent(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "ambient-token-must-not-be-sent")

	config := &ConfigTarget{ //nolint:exhaustruct
		Provider: "anthropic",
		Model:    "claude-test",
		APIKey:   "configured-key",
	}

	credential := ResolveCredential(config)
	transport := &capturingTransport{} //nolint:exhaustruct

	opts := append(
		anthropicClientOptions(config, credential),
		option.WithHTTPClient(&http.Client{Transport: transport}), //nolint:exhaustruct
		option.WithMaxRetries(0),
	)

	client := anthropic.NewClient(opts...)

	_, _ = client.Messages.New(context.Background(), anthropic.MessageNewParams{ //nolint:exhaustruct
		Model:     "claude-test",
		MaxTokens: 1,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("hi")),
		},
	})

	if transport.header == nil {
		t.Fatal("no request was sent")
	}

	if got := transport.header.Get("Authorization"); got != "" {
		t.Fatalf("an ambient environment credential was sent: Authorization = %q", got)
	}

	if got := transport.header.Get("X-Api-Key"); got != "configured-key" {
		t.Fatalf("X-Api-Key = %q, want the configured key", got)
	}
}

// TestBaseURLFallsBackToTheEnvironment pins a regression that
// WithoutEnvironmentDefaults would otherwise introduce silently.
//
// Suppressing the SDK's env chain also suppresses its ANTHROPIC_BASE_URL
// autoload. config.BaseURL is only applied when set, so a machine pointing at a
// proxy purely through the environment would have started talking to the public
// API instead — with no error, and with the credential attached.
func TestBaseURLFallsBackToTheEnvironment(t *testing.T) {
	t.Setenv("ANTHROPIC_BASE_URL", "https://proxy.example/v1/")

	transport := &capturingTransport{} //nolint:exhaustruct

	opts := append(
		anthropicClientOptions(
			&ConfigTarget{Provider: "anthropic"}, //nolint:exhaustruct
			Credential{Value: "k", Kind: CredentialAPIKey},
		),
		option.WithHTTPClient(&http.Client{Transport: transport}), //nolint:exhaustruct
		option.WithMaxRetries(0),
	)

	client := anthropic.NewClient(opts...)

	_, _ = client.Messages.New(context.Background(), anthropic.MessageNewParams{ //nolint:exhaustruct
		Model: "m", MaxTokens: 1,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("hi")),
		},
	})

	if transport.url == nil {
		t.Fatal("no request was sent")
	}

	if got := transport.url.Host; got != "proxy.example" {
		t.Fatalf("request went to %q, not the ANTHROPIC_BASE_URL proxy", got)
	}
}

// An explicitly configured BaseURL still wins over the environment.
func TestConfiguredBaseURLWinsOverTheEnvironment(t *testing.T) {
	t.Setenv("ANTHROPIC_BASE_URL", "https://env.example/v1/")

	transport := &capturingTransport{} //nolint:exhaustruct

	opts := append(
		anthropicClientOptions(
			&ConfigTarget{Provider: "anthropic", BaseURL: "https://configured.example/v1/"}, //nolint:exhaustruct
			Credential{Value: "k", Kind: CredentialAPIKey},
		),
		option.WithHTTPClient(&http.Client{Transport: transport}), //nolint:exhaustruct
		option.WithMaxRetries(0),
	)

	client := anthropic.NewClient(opts...)

	_, _ = client.Messages.New(context.Background(), anthropic.MessageNewParams{ //nolint:exhaustruct
		Model: "m", MaxTokens: 1,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("hi")),
		},
	})

	if got := transport.url.Host; got != "configured.example" {
		t.Fatalf("request went to %q, want the configured base URL", got)
	}
}
