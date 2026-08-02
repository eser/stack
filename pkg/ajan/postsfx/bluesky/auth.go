// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

import (
	"context"
	"fmt"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// AuthConfig holds Bluesky connection settings. No client credentials needed — auth is
// via direct credential login (com.atproto.server.createSession).
type AuthConfig struct {
	// Host overrides the default bsky.social PDS host (e.g. for self-hosted instances).
	Host string
}

// AuthProvider implements postsfx.AuthProvider for Bluesky (AT Protocol).
// Bluesky uses direct credential login — no browser required.
type AuthProvider struct {
	cfg     AuthConfig
	session *apiSession
}

// NewAuthProvider creates a new Bluesky AuthProvider.
func NewAuthProvider(cfg AuthConfig) *AuthProvider {
	return &AuthProvider{cfg: cfg}
}

// RequiresBrowser returns false — Bluesky uses direct credential login.
func (a *AuthProvider) RequiresBrowser() bool { return false }

// IsAuthenticated reports whether an active session exists.
func (a *AuthProvider) IsAuthenticated(_ context.Context) (bool, error) {
	return a.session != nil && a.session.AccessJwt != "", nil
}

// GetAuthorizationURL is not applicable for Bluesky.
func (a *AuthProvider) GetAuthorizationURL(_ context.Context) (string, error) {
	return "", fmt.Errorf("GetAuthorizationURL: %w", ErrBrowserNotRequired)
}

// ExchangeCode is not applicable for Bluesky.
func (a *AuthProvider) ExchangeCode(_ context.Context, _, _ string) (*postsfx.OAuthTokens, error) {
	return nil, fmt.Errorf("ExchangeCode: %w", ErrBrowserNotRequired)
}

// LoginWithCredentials authenticates via the AT Protocol createSession XRPC call.
// identifier may be a handle (@user.bsky.social) or a DID.
func (a *AuthProvider) LoginWithCredentials(ctx context.Context, identifier, password string) (*postsfx.OAuthTokens, error) {
	c := newClient("") // no token on initial login
	var session apiSession

	if err := c.procedure(ctx, "com.atproto.server.createSession", map[string]string{
		"identifier": identifier,
		"password":   password,
	}, "", &session); err != nil {
		return nil, fmt.Errorf("LoginWithCredentials: %w", err)
	}

	a.session = &session

	return tokensFromSession(&session), nil
}

// RefreshToken refreshes the AT Protocol session using the refresh JWT.
func (a *AuthProvider) RefreshToken(ctx context.Context, refreshToken string) (*postsfx.OAuthTokens, error) {
	c := newClient("")
	var session apiSession

	// refreshSession requires the refresh JWT as the bearer — not the access JWT.
	if err := c.procedure(ctx, "com.atproto.server.refreshSession", nil, refreshToken, &session); err != nil {
		return nil, fmt.Errorf("RefreshToken: %w", err)
	}

	a.session = &session

	return tokensFromSession(&session), nil
}

// SetTokens restores a session from stored tokens.
// The DID must be available in tokens.PlatformData["did"].
func (a *AuthProvider) SetTokens(_ context.Context, tokens *postsfx.OAuthTokens) error {
	did := ""
	if tokens.PlatformData != nil {
		did = tokens.PlatformData["did"]
	}

	a.session = &apiSession{
		AccessJwt:  tokens.AccessToken,
		RefreshJwt: tokens.RefreshToken,
		DID:        did,
	}

	return nil
}

// ClearTokens removes the stored session.
func (a *AuthProvider) ClearTokens(_ context.Context) error {
	a.session = nil
	return nil
}

// CurrentSession returns the active session (may be nil).
func (a *AuthProvider) CurrentSession() *apiSession {
	return a.session
}

// --- helpers ---

func tokensFromSession(s *apiSession) *postsfx.OAuthTokens {
	return &postsfx.OAuthTokens{
		AccessToken:  s.AccessJwt,
		RefreshToken: s.RefreshJwt,
		PlatformData: map[string]string{
			"did":    s.DID,
			"handle": s.Handle,
		},
	}
}
