// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"context"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// ─── mapRefType ──────────────────────────────────────────────────────────────

func TestMapRefType_AllBranches(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input    string
		expected postsfx.ReferencedPostType
	}{
		{"replied_to", postsfx.ReferencedPostRepliedTo},
		{"quoted", postsfx.ReferencedPostQuoted},
		{"retweeted", postsfx.ReferencedPostReposted},
		{"unknown_type", postsfx.ReferencedPostType("unknown_type")},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()

			got := mapRefType(tc.input)
			if got != tc.expected {
				t.Errorf("mapRefType(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

// ─── mapSubscription ─────────────────────────────────────────────────────────

func TestMapSubscription_AllBranches(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input    string
		expected postsfx.SubscriptionTier
	}{
		{"premium", postsfx.SubscriptionPremium},
		{"premium_plus", postsfx.SubscriptionPremiumPlus},
		{"business", postsfx.SubscriptionBusiness},
		{"", postsfx.SubscriptionFree},
		{"unknown", postsfx.SubscriptionFree},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.input+"_"+string(tc.expected), func(t *testing.T) {
			t.Parallel()

			got := mapSubscription(tc.input)
			if got != tc.expected {
				t.Errorf("mapSubscription(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

// ─── mapUser ─────────────────────────────────────────────────────────────────

func TestMapUser_Basic(t *testing.T) {
	t.Parallel()

	u := &apiUser{
		ID:               "12345",
		Name:             "Alice Wonderland",
		Username:         "alicewonder",
		SubscriptionType: "premium",
	}

	result := mapUser(u)

	if result.ID != "12345" {
		t.Errorf("expected ID='12345', got %q", result.ID)
	}

	if string(result.Handle) != "alicewonder" {
		t.Errorf("expected handle 'alicewonder', got %q", result.Handle)
	}

	if result.DisplayName != "Alice Wonderland" {
		t.Errorf("expected DisplayName 'Alice Wonderland', got %q", result.DisplayName)
	}

	if result.Platform != postsfx.PlatformTwitter {
		t.Errorf("expected PlatformTwitter, got %q", result.Platform)
	}

	if result.SubscriptionTier != postsfx.SubscriptionPremium {
		t.Errorf("expected SubscriptionPremium, got %q", result.SubscriptionTier)
	}
}

// ─── buildUserIndex ──────────────────────────────────────────────────────────

func TestBuildUserIndex_Empty(t *testing.T) {
	t.Parallel()

	idx := buildUserIndex(nil)
	if len(idx) != 0 {
		t.Errorf("expected empty index, got %d entries", len(idx))
	}
}

func TestBuildUserIndex_MultipleUsers(t *testing.T) {
	t.Parallel()

	users := []apiUser{
		{ID: "1", Username: "alice"},
		{ID: "2", Username: "bob"},
		{ID: "3", Username: "charlie"},
	}

	idx := buildUserIndex(users)

	if len(idx) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(idx))
	}

	if idx["1"].Username != "alice" {
		t.Errorf("expected alice at key '1', got %q", idx["1"].Username)
	}

	if idx["3"].Username != "charlie" {
		t.Errorf("expected charlie at key '3', got %q", idx["3"].Username)
	}
}

// ─── mapPost ─────────────────────────────────────────────────────────────────

func TestMapPost_Basic(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:   "tweet123",
		Text: "Hello Twitter!",
	}

	p := mapPost(tweet, nil)

	if string(p.ID) != "tweet123" {
		t.Errorf("expected ID='tweet123', got %q", p.ID)
	}

	if p.Text != "Hello Twitter!" {
		t.Errorf("expected text 'Hello Twitter!', got %q", p.Text)
	}

	if p.Platform != postsfx.PlatformTwitter {
		t.Errorf("expected PlatformTwitter, got %q", p.Platform)
	}
}

func TestMapPost_WithAuthorLookup(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:       "tweet456",
		Text:     "tweet with author",
		AuthorID: "user42",
	}

	userByID := map[string]*apiUser{
		"user42": {ID: "user42", Username: "tweetperson"},
	}

	p := mapPost(tweet, userByID)

	if string(p.AuthorHandle) != "tweetperson" {
		t.Errorf("expected handle 'tweetperson', got %q", p.AuthorHandle)
	}
}

func TestMapPost_AuthorIDMissingFromIndex(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:       "tweet789",
		Text:     "no author in index",
		AuthorID: "ghost",
	}

	p := mapPost(tweet, map[string]*apiUser{})

	if p.AuthorHandle != "" {
		t.Errorf("expected empty handle when author not in index, got %q", p.AuthorHandle)
	}
}

func TestMapPost_WithCreatedAt(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:        "tweet001",
		Text:      "dated tweet",
		CreatedAt: "2024-03-10T14:00:00Z",
	}

	p := mapPost(tweet, nil)

	expected, _ := time.Parse(time.RFC3339, "2024-03-10T14:00:00Z")
	if !p.CreatedAt.Equal(expected) {
		t.Errorf("expected CreatedAt %v, got %v", expected, p.CreatedAt)
	}
}

func TestMapPost_InvalidCreatedAt(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:        "tweet002",
		Text:      "bad date",
		CreatedAt: "not-a-date",
	}

	p := mapPost(tweet, nil)

	if !p.CreatedAt.IsZero() {
		t.Errorf("expected zero CreatedAt for invalid date, got %v", p.CreatedAt)
	}
}

func TestMapPost_WithConversationID(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:             "reply123",
		Text:           "this is a reply",
		ConversationID: "thread999",
	}

	p := mapPost(tweet, nil)

	if p.ConversationID == nil {
		t.Fatal("expected non-nil ConversationID")
	}

	if string(*p.ConversationID) != "thread999" {
		t.Errorf("expected ConversationID='thread999', got %q", *p.ConversationID)
	}
}

func TestMapPost_ConversationIDSameAsTweetID(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:             "root123",
		Text:           "root tweet",
		ConversationID: "root123",
	}

	p := mapPost(tweet, nil)

	if p.ConversationID != nil {
		t.Error("expected nil ConversationID when same as tweet ID (root post)")
	}
}

func TestMapPost_ReferencedTweets_AllTypes(t *testing.T) {
	t.Parallel()

	tweet := &apiTweet{
		ID:   "tweet_with_refs",
		Text: "referencing others",
		ReferencedTweets: []apiReferencedTweet{
			{Type: "replied_to", ID: "parent1"},
			{Type: "quoted", ID: "quoted1"},
			{Type: "retweeted", ID: "rt1"},
		},
	}

	p := mapPost(tweet, nil)

	if len(p.ReferencedPosts) != 3 {
		t.Fatalf("expected 3 referenced posts, got %d", len(p.ReferencedPosts))
	}

	if p.InReplyToID == nil {
		t.Fatal("expected non-nil InReplyToID for replied_to reference")
	}

	if string(*p.InReplyToID) != "parent1" {
		t.Errorf("expected InReplyToID='parent1', got %q", *p.InReplyToID)
	}

	if p.ReferencedPosts[1].Type != postsfx.ReferencedPostQuoted {
		t.Errorf("expected quoted type, got %q", p.ReferencedPosts[1].Type)
	}
}

// ─── tokensFromResponse ──────────────────────────────────────────────────────

func TestTokensFromResponse_WithExpiry(t *testing.T) {
	t.Parallel()

	resp := &apiTokenResponse{
		AccessToken:  "acc-token",
		RefreshToken: "ref-token",
		ExpiresIn:    3600,
	}

	before := time.Now()
	tokens := tokensFromResponse(resp)
	after := time.Now()

	if tokens.AccessToken != "acc-token" {
		t.Errorf("expected 'acc-token', got %q", tokens.AccessToken)
	}

	if tokens.RefreshToken != "ref-token" {
		t.Errorf("expected 'ref-token', got %q", tokens.RefreshToken)
	}

	if tokens.ExpiresAt == nil {
		t.Fatal("expected non-nil ExpiresAt")
	}

	minExpiry := before.Add(3600 * time.Second)
	maxExpiry := after.Add(3600 * time.Second)

	if tokens.ExpiresAt.Before(minExpiry) || tokens.ExpiresAt.After(maxExpiry) {
		t.Errorf("ExpiresAt=%v outside expected range [%v, %v]", *tokens.ExpiresAt, minExpiry, maxExpiry)
	}
}

func TestTokensFromResponse_ZeroExpiry(t *testing.T) {
	t.Parallel()

	resp := &apiTokenResponse{
		AccessToken: "acc",
		ExpiresIn:   0,
	}

	tokens := tokensFromResponse(resp)

	if tokens.ExpiresAt != nil {
		t.Errorf("expected nil ExpiresAt when ExpiresIn=0, got %v", tokens.ExpiresAt)
	}
}

// ─── deriveCodeChallenge ─────────────────────────────────────────────────────

func TestDeriveCodeChallenge_Deterministic(t *testing.T) {
	t.Parallel()

	c1 := deriveCodeChallenge("my-verifier")
	c2 := deriveCodeChallenge("my-verifier")

	if c1 != c2 {
		t.Errorf("expected same challenge for same verifier, got %q vs %q", c1, c2)
	}
}

func TestDeriveCodeChallenge_DifferentInputs(t *testing.T) {
	t.Parallel()

	c1 := deriveCodeChallenge("verifier-a")
	c2 := deriveCodeChallenge("verifier-b")

	if c1 == c2 {
		t.Error("expected different challenges for different verifiers")
	}
}

func TestDeriveCodeChallenge_NotEmpty(t *testing.T) {
	t.Parallel()

	c := deriveCodeChallenge("any-verifier")
	if c == "" {
		t.Error("expected non-empty challenge")
	}
}

// ─── AuthProvider (pure state methods) ───────────────────────────────────────

func TestAuthProvider_RequiresBrowser(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{ClientID: "test", RedirectURI: "http://localhost"})
	if !a.RequiresBrowser() {
		t.Error("Twitter should require browser for OAuth 2.0 PKCE")
	}
}

func TestAuthProvider_IsAuthenticated_NoTokens(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	ok, err := a.IsAuthenticated(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("expected not authenticated with no tokens")
	}
}

func TestAuthProvider_SetAndClearTokens(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})

	tokens := &postsfx.OAuthTokens{
		AccessToken: "mytoken",
	}

	if err := a.SetTokens(context.Background(), tokens); err != nil {
		t.Fatalf("SetTokens error: %v", err)
	}

	ok, _ := a.IsAuthenticated(context.Background())
	if !ok {
		t.Error("expected authenticated after SetTokens")
	}

	if a.CurrentTokens() == nil || a.CurrentTokens().AccessToken != "mytoken" {
		t.Errorf("expected CurrentTokens with 'mytoken', got %+v", a.CurrentTokens())
	}

	if err := a.ClearTokens(context.Background()); err != nil {
		t.Fatalf("ClearTokens error: %v", err)
	}

	ok, _ = a.IsAuthenticated(context.Background())
	if ok {
		t.Error("expected not authenticated after ClearTokens")
	}
}

func TestAuthProvider_IsAuthenticated_Expired(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})

	past := time.Now().Add(-time.Hour)
	tokens := &postsfx.OAuthTokens{
		AccessToken: "expired-token",
		ExpiresAt:   &past,
	}

	_ = a.SetTokens(context.Background(), tokens)

	ok, err := a.IsAuthenticated(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("expected not authenticated with expired token")
	}
}

func TestAuthProvider_LoginWithCredentials_Error(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	_, err := a.LoginWithCredentials(context.Background(), "user", "pass")
	if err == nil {
		t.Error("expected error for Twitter LoginWithCredentials")
	}
}
