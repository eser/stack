// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

const (
	tokenEndpoint = "https://api.twitter.com/2/oauth2/token"
	authEndpoint  = "https://twitter.com/i/oauth2/authorize"
	defaultScopes = "tweet.read tweet.write users.read bookmark.write offline.access"
)

// AuthConfig holds Twitter OAuth 2.0 application credentials.
type AuthConfig struct {
	ClientID    string
	RedirectURI string
}

// AuthProvider implements postsfx.AuthProvider for Twitter OAuth 2.0 PKCE.
type AuthProvider struct {
	cfg    AuthConfig
	tokens *postsfx.OAuthTokens
	// codeVerifier is stored temporarily between GetAuthorizationURL and ExchangeCode.
	codeVerifier string
}

// NewAuthProvider creates a new Twitter AuthProvider.
func NewAuthProvider(cfg AuthConfig) *AuthProvider {
	return &AuthProvider{cfg: cfg}
}

// RequiresBrowser returns true — Twitter OAuth 2.0 PKCE requires a browser redirect.
func (a *AuthProvider) RequiresBrowser() bool { return true }

// IsAuthenticated reports whether a non-expired access token is available.
func (a *AuthProvider) IsAuthenticated(_ context.Context) (bool, error) {
	if a.tokens == nil || a.tokens.AccessToken == "" {
		return false, nil
	}

	if a.tokens.ExpiresAt != nil && time.Now().After(*a.tokens.ExpiresAt) {
		return false, nil
	}

	return true, nil
}

// GetAuthorizationURL generates a PKCE authorization URL and caches the code verifier.
func (a *AuthProvider) GetAuthorizationURL(_ context.Context) (string, error) {
	verifier, err := generateCodeVerifier()
	if err != nil {
		return "", fmt.Errorf("generating code verifier: %w", err)
	}

	a.codeVerifier = verifier
	challenge := deriveCodeChallenge(verifier)

	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", fmt.Errorf("generating state: %w", err)
	}

	state := base64.RawURLEncoding.EncodeToString(stateBytes)

	params := url.Values{}
	params.Set("response_type", "code")
	params.Set("client_id", a.cfg.ClientID)
	params.Set("redirect_uri", a.cfg.RedirectURI)
	params.Set("scope", defaultScopes)
	params.Set("state", state)
	params.Set("code_challenge", challenge)
	params.Set("code_challenge_method", "S256")

	return authEndpoint + "?" + params.Encode(), nil
}

// ExchangeCode exchanges an authorization code for tokens using PKCE.
func (a *AuthProvider) ExchangeCode(ctx context.Context, code, codeVerifier string) (*postsfx.OAuthTokens, error) {
	if codeVerifier == "" {
		codeVerifier = a.codeVerifier
	}

	c := newClient("") // no Bearer token for the token endpoint
	var resp apiTokenResponse

	if err := c.postForm(ctx, tokenEndpoint, map[string]string{
		"grant_type":    "authorization_code",
		"code":          code,
		"redirect_uri":  a.cfg.RedirectURI,
		"client_id":     a.cfg.ClientID,
		"code_verifier": codeVerifier,
	}, &resp); err != nil {
		return nil, fmt.Errorf("exchanging code: %w", err)
	}

	tokens := tokensFromResponse(&resp)
	a.tokens = tokens

	return tokens, nil
}

// LoginWithCredentials is not supported for Twitter (OAuth 2.0 only).
func (a *AuthProvider) LoginWithCredentials(_ context.Context, _, _ string) (*postsfx.OAuthTokens, error) {
	return nil, fmt.Errorf("LoginWithCredentials: %w", ErrBrowserRequired)
}

// RefreshToken exchanges a refresh token for a new access token.
func (a *AuthProvider) RefreshToken(ctx context.Context, refreshToken string) (*postsfx.OAuthTokens, error) {
	c := newClient("")
	var resp apiTokenResponse

	if err := c.postForm(ctx, tokenEndpoint, map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
		"client_id":     a.cfg.ClientID,
	}, &resp); err != nil {
		return nil, fmt.Errorf("refreshing token: %w", err)
	}

	tokens := tokensFromResponse(&resp)
	a.tokens = tokens

	return tokens, nil
}

// SetTokens stores the given tokens as the active session.
func (a *AuthProvider) SetTokens(_ context.Context, tokens *postsfx.OAuthTokens) error {
	a.tokens = tokens
	return nil
}

// ClearTokens removes the stored tokens.
func (a *AuthProvider) ClearTokens(_ context.Context) error {
	a.tokens = nil
	return nil
}

// CurrentTokens returns the currently stored tokens (may be nil).
func (a *AuthProvider) CurrentTokens() *postsfx.OAuthTokens {
	return a.tokens
}

// --- helpers ---

// generateCodeVerifier creates a 64-byte random base64url-encoded verifier.
func generateCodeVerifier() (string, error) {
	b := make([]byte, 64)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(b), nil
}

// deriveCodeChallenge returns the S256 code challenge for a verifier.
func deriveCodeChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// tokensFromResponse maps an API token response to the domain type.
func tokensFromResponse(resp *apiTokenResponse) *postsfx.OAuthTokens {
	tokens := &postsfx.OAuthTokens{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
	}

	if resp.ExpiresIn > 0 {
		exp := time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second)
		tokens.ExpiresAt = &exp
	}

	return tokens
}
