// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/postsfx"
	"github.com/eser/stack/pkg/ajan/postsfx/twitter"
)

// ── mapper tests ──────────────────────────────────────────────────────────────

func TestMappers_BasicTweet(t *testing.T) {
	t.Parallel()

	// We test via NewAdapter indirectly; the mappers package is unexported.
	// Verify that NewAdapter builds without panic.
	adapter := twitter.NewAdapter("test-token")
	if adapter == nil {
		t.Fatal("expected non-nil adapter")
	}
}

// ── auth helper tests ─────────────────────────────────────────────────────────

func TestNewAuthProvider(t *testing.T) {
	t.Parallel()

	auth := twitter.NewAuthProvider(twitter.AuthConfig{
		ClientID:    "test-client",
		RedirectURI: "http://localhost/callback",
	})

	if auth == nil {
		t.Fatal("expected non-nil auth provider")
	}

	if !auth.RequiresBrowser() {
		t.Error("Twitter OAuth should require browser")
	}

	ok, err := auth.IsAuthenticated(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("should not be authenticated before any token exchange")
	}
}

func TestGetAuthorizationURL_GeneratesURL(t *testing.T) {
	t.Parallel()

	auth := twitter.NewAuthProvider(twitter.AuthConfig{
		ClientID:    "my-client-id",
		RedirectURI: "https://app.example.com/callback",
	})

	url, err := auth.GetAuthorizationURL(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if url == "" {
		t.Fatal("expected non-empty authorization URL")
	}

	// Verify it points to the correct endpoint.
	if len(url) < 30 || url[:29] != "https://twitter.com/i/oauth2/" {
		t.Errorf("unexpected URL prefix: %q", url[:min(50, len(url))])
	}
}

func TestGetAuthorizationURL_UniqueVerifiers(t *testing.T) {
	t.Parallel()

	auth := twitter.NewAuthProvider(twitter.AuthConfig{
		ClientID:    "client",
		RedirectURI: "http://localhost",
	})

	url1, err := auth.GetAuthorizationURL(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	url2, err := auth.GetAuthorizationURL(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	// Two calls should produce different state/challenge params.
	if url1 == url2 {
		t.Error("consecutive GetAuthorizationURL calls should produce different URLs (random state)")
	}
}

func TestSetAndClearTokens(t *testing.T) {
	t.Parallel()

	auth := twitter.NewAuthProvider(twitter.AuthConfig{ClientID: "c", RedirectURI: "r"})

	tokens := &postsfx.OAuthTokens{AccessToken: "tok123"}
	if err := auth.SetTokens(t.Context(), tokens); err != nil {
		t.Fatalf("SetTokens error: %v", err)
	}

	ok, err := auth.IsAuthenticated(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !ok {
		t.Error("should be authenticated after SetTokens")
	}

	if err := auth.ClearTokens(t.Context()); err != nil {
		t.Fatalf("ClearTokens error: %v", err)
	}

	ok, err = auth.IsAuthenticated(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("should not be authenticated after ClearTokens")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}

	return b
}
