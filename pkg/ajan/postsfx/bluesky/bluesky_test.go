// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/postsfx"
	"github.com/eser/stack/pkg/ajan/postsfx/bluesky"
)

func TestNewAdapter(t *testing.T) {
	t.Parallel()

	adapter := bluesky.NewAdapter("jwt-token", "did:plc:abc123")
	if adapter == nil {
		t.Fatal("expected non-nil adapter")
	}
}

func TestNewAuthProvider(t *testing.T) {
	t.Parallel()

	auth := bluesky.NewAuthProvider(bluesky.AuthConfig{})
	if auth == nil {
		t.Fatal("expected non-nil auth provider")
	}

	if auth.RequiresBrowser() {
		t.Error("Bluesky should NOT require browser (credential login)")
	}

	ok, err := auth.IsAuthenticated(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("should not be authenticated before login")
	}
}

func TestGetAuthorizationURL_NotSupported(t *testing.T) {
	t.Parallel()

	auth := bluesky.NewAuthProvider(bluesky.AuthConfig{})

	_, err := auth.GetAuthorizationURL(t.Context())
	if err == nil {
		t.Fatal("expected error — Bluesky uses credential login, not OAuth redirect")
	}
}

func TestSetTokensRestoresSession(t *testing.T) {
	t.Parallel()

	auth := bluesky.NewAuthProvider(bluesky.AuthConfig{})

	tokens := &postsfx.OAuthTokens{
		AccessToken:  "access-jwt",
		RefreshToken: "refresh-jwt",
		PlatformData: map[string]string{"did": "did:plc:xyz", "handle": "user.bsky.social"},
	}

	if err := auth.SetTokens(t.Context(), tokens); err != nil {
		t.Fatalf("SetTokens error: %v", err)
	}

	ok, err := auth.IsAuthenticated(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if !ok {
		t.Error("should be authenticated after SetTokens")
	}

	session := auth.CurrentSession()
	if session == nil {
		t.Fatal("expected non-nil session")
	}

	if session.DID != "did:plc:xyz" {
		t.Errorf("DID: want %q, got %q", "did:plc:xyz", session.DID)
	}

	if session.AccessJwt != "access-jwt" {
		t.Errorf("AccessJwt: want %q, got %q", "access-jwt", session.AccessJwt)
	}
}

func TestClearTokens(t *testing.T) {
	t.Parallel()

	auth := bluesky.NewAuthProvider(bluesky.AuthConfig{})
	_ = auth.SetTokens(t.Context(), &postsfx.OAuthTokens{AccessToken: "tok"})

	if err := auth.ClearTokens(t.Context()); err != nil {
		t.Fatalf("ClearTokens: %v", err)
	}

	ok, _ := auth.IsAuthenticated(t.Context())
	if ok {
		t.Error("should not be authenticated after ClearTokens")
	}

	if auth.CurrentSession() != nil {
		t.Error("session should be nil after ClearTokens")
	}
}
