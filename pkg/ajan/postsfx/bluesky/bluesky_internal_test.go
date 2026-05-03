// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

import (
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// ─── mapPost ─────────────────────────────────────────────────────────────────

func TestMapPost_WithCreatedAt(t *testing.T) {
	t.Parallel()

	v := &apiPostView{
		URI: "at://did:plc:abc/app.bsky.feed.post/rkey1",
		CID: "bafycid1",
		Author: apiProfile{
			Handle: "alice.bsky.social",
		},
		Record: apiPostViewRecord{
			Text:      "hello world",
			CreatedAt: "2024-01-15T10:30:00Z",
		},
	}

	p := mapPost(v)

	if p == nil {
		t.Fatal("expected non-nil post")
	}

	if string(p.ID) != v.URI {
		t.Errorf("expected ID=%q, got %q", v.URI, p.ID)
	}

	if p.Text != "hello world" {
		t.Errorf("expected text 'hello world', got %q", p.Text)
	}

	if string(p.AuthorHandle) != "alice.bsky.social" {
		t.Errorf("expected handle 'alice.bsky.social', got %q", p.AuthorHandle)
	}

	if p.Platform != postsfx.PlatformBluesky {
		t.Errorf("expected PlatformBluesky, got %q", p.Platform)
	}

	if p.PlatformRef["uri"] != v.URI {
		t.Errorf("expected uri in PlatformRef, got %q", p.PlatformRef["uri"])
	}

	if p.PlatformRef["cid"] != "bafycid1" {
		t.Errorf("expected cid in PlatformRef, got %q", p.PlatformRef["cid"])
	}

	expected, _ := time.Parse(time.RFC3339, "2024-01-15T10:30:00Z")
	if !p.CreatedAt.Equal(expected) {
		t.Errorf("expected CreatedAt %v, got %v", expected, p.CreatedAt)
	}
}

func TestMapPost_FallbackToIndexedAt(t *testing.T) {
	t.Parallel()

	v := &apiPostView{
		URI:       "at://did/collection/rkey",
		IndexedAt: "2024-02-20T08:00:00Z",
		Author:    apiProfile{Handle: "bob.bsky.social"},
		Record:    apiPostViewRecord{Text: "fallback"},
	}

	p := mapPost(v)

	expected, _ := time.Parse(time.RFC3339, "2024-02-20T08:00:00Z")
	if !p.CreatedAt.Equal(expected) {
		t.Errorf("expected IndexedAt fallback %v, got %v", expected, p.CreatedAt)
	}
}

func TestMapPost_NoTimestamp(t *testing.T) {
	t.Parallel()

	v := &apiPostView{
		URI:    "at://did/collection/rkey",
		Author: apiProfile{Handle: "charlie.bsky.social"},
		Record: apiPostViewRecord{Text: "no time"},
	}

	p := mapPost(v)

	if !p.CreatedAt.IsZero() {
		t.Errorf("expected zero CreatedAt, got %v", p.CreatedAt)
	}
}

func TestMapPost_InvalidTimestamp(t *testing.T) {
	t.Parallel()

	v := &apiPostView{
		URI: "at://did/collection/rkey",
		Record: apiPostViewRecord{
			Text:      "bad time",
			CreatedAt: "not-a-date",
		},
		IndexedAt: "also-not-a-date",
		Author:    apiProfile{Handle: "user.bsky.social"},
	}

	p := mapPost(v)

	if !p.CreatedAt.IsZero() {
		t.Errorf("expected zero CreatedAt for invalid timestamps, got %v", p.CreatedAt)
	}
}

// ─── mapUser ─────────────────────────────────────────────────────────────────

func TestMapUser(t *testing.T) {
	t.Parallel()

	profile := &apiProfile{
		DID:         "did:plc:abc123",
		Handle:      "alice.bsky.social",
		DisplayName: "Alice",
	}

	u := mapUser(profile)

	if u.ID != "did:plc:abc123" {
		t.Errorf("expected ID 'did:plc:abc123', got %q", u.ID)
	}

	if string(u.Handle) != "alice.bsky.social" {
		t.Errorf("expected handle 'alice.bsky.social', got %q", u.Handle)
	}

	if u.DisplayName != "Alice" {
		t.Errorf("expected DisplayName 'Alice', got %q", u.DisplayName)
	}

	if u.Platform != postsfx.PlatformBluesky {
		t.Errorf("expected PlatformBluesky, got %q", u.Platform)
	}

	if u.SubscriptionTier != postsfx.SubscriptionFree {
		t.Errorf("expected SubscriptionFree, got %q", u.SubscriptionTier)
	}
}

// ─── rkeyFromURI ─────────────────────────────────────────────────────────────

func TestRkeyFromURI_Standard(t *testing.T) {
	t.Parallel()

	rkey := rkeyFromURI("at://did:plc:abc/app.bsky.feed.post/mykey123")
	if rkey != "mykey123" {
		t.Errorf("expected 'mykey123', got %q", rkey)
	}
}

func TestRkeyFromURI_ShortURI(t *testing.T) {
	t.Parallel()

	rkey := rkeyFromURI("justonepart")
	if rkey != "justonepart" {
		t.Errorf("expected 'justonepart', got %q", rkey)
	}
}

func TestRkeyFromURI_Empty(t *testing.T) {
	t.Parallel()

	rkey := rkeyFromURI("")
	if rkey != "" {
		t.Errorf("expected empty string for empty input, got %q", rkey)
	}
}

func TestRkeyFromURI_TrailingSlash(t *testing.T) {
	t.Parallel()

	rkey := rkeyFromURI("at://did/collection/rkey/")
	if rkey != "" {
		t.Errorf("expected empty string after trailing slash, got %q", rkey)
	}
}

// ─── flattenThread ───────────────────────────────────────────────────────────

func TestFlattenThread_SinglePost(t *testing.T) {
	t.Parallel()

	view := apiThreadView{
		Post: apiPostView{
			URI:    "at://did/coll/root",
			Author: apiProfile{Handle: "alice.bsky.social"},
			Record: apiPostViewRecord{Text: "root post"},
		},
	}

	posts := flattenThread(view)

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}

	if posts[0].Text != "root post" {
		t.Errorf("expected 'root post', got %q", posts[0].Text)
	}
}

func TestFlattenThread_WithReplies(t *testing.T) {
	t.Parallel()

	view := apiThreadView{
		Post: apiPostView{
			URI:    "at://did/coll/root",
			Author: apiProfile{Handle: "alice.bsky.social"},
			Record: apiPostViewRecord{Text: "root"},
		},
		Replies: []apiThreadView{
			{
				Post: apiPostView{
					URI:    "at://did/coll/reply1",
					Author: apiProfile{Handle: "bob.bsky.social"},
					Record: apiPostViewRecord{Text: "reply1"},
				},
				Replies: []apiThreadView{
					{
						Post: apiPostView{
							URI:    "at://did/coll/reply2",
							Author: apiProfile{Handle: "charlie.bsky.social"},
							Record: apiPostViewRecord{Text: "reply2"},
						},
					},
				},
			},
		},
	}

	posts := flattenThread(view)

	if len(posts) != 3 {
		t.Fatalf("expected 3 posts (root+2 nested), got %d", len(posts))
	}

	if posts[0].Text != "root" {
		t.Errorf("expected root first, got %q", posts[0].Text)
	}
}

// ─── tokensFromSession ───────────────────────────────────────────────────────

func TestTokensFromSession(t *testing.T) {
	t.Parallel()

	s := &apiSession{
		AccessJwt:  "access-token-xyz",
		RefreshJwt: "refresh-token-abc",
		DID:        "did:plc:test123",
		Handle:     "alice.bsky.social",
	}

	tokens := tokensFromSession(s)

	if tokens.AccessToken != "access-token-xyz" {
		t.Errorf("expected 'access-token-xyz', got %q", tokens.AccessToken)
	}

	if tokens.RefreshToken != "refresh-token-abc" {
		t.Errorf("expected 'refresh-token-abc', got %q", tokens.RefreshToken)
	}

	if tokens.PlatformData["did"] != "did:plc:test123" {
		t.Errorf("expected DID in PlatformData, got %q", tokens.PlatformData["did"])
	}

	if tokens.PlatformData["handle"] != "alice.bsky.social" {
		t.Errorf("expected handle in PlatformData, got %q", tokens.PlatformData["handle"])
	}
}

// ─── AuthProvider (pure state methods) ───────────────────────────────────────

func TestAuthProvider_RequiresBrowser(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	if a.RequiresBrowser() {
		t.Error("Bluesky should not require browser")
	}
}

func TestAuthProvider_IsAuthenticated_NoSession(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	ok, err := a.IsAuthenticated(nil) //nolint:staticcheck
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if ok {
		t.Error("expected not authenticated with no session")
	}
}

func TestAuthProvider_SetAndClearTokens(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})

	tokens := &postsfx.OAuthTokens{
		AccessToken:  "tok",
		RefreshToken: "ref",
		PlatformData: map[string]string{"did": "did:test"},
	}

	if err := a.SetTokens(nil, tokens); err != nil { //nolint:staticcheck
		t.Fatalf("SetTokens error: %v", err)
	}

	ok, _ := a.IsAuthenticated(nil) //nolint:staticcheck
	if !ok {
		t.Error("expected authenticated after SetTokens")
	}

	sess := a.CurrentSession()
	if sess == nil || sess.AccessJwt != "tok" {
		t.Errorf("expected session with accessJwt='tok', got %+v", sess)
	}

	if err := a.ClearTokens(nil); err != nil { //nolint:staticcheck
		t.Fatalf("ClearTokens error: %v", err)
	}

	ok, _ = a.IsAuthenticated(nil) //nolint:staticcheck
	if ok {
		t.Error("expected not authenticated after ClearTokens")
	}
}

func TestAuthProvider_GetAuthorizationURL_Error(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	_, err := a.GetAuthorizationURL(nil) //nolint:staticcheck
	if err == nil {
		t.Error("expected error for GetAuthorizationURL on Bluesky")
	}
}

func TestAuthProvider_ExchangeCode_Error(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})
	_, err := a.ExchangeCode(nil, "code", "verifier") //nolint:staticcheck
	if err == nil {
		t.Error("expected error for ExchangeCode on Bluesky")
	}
}

func TestAuthProvider_SetTokens_NilPlatformData(t *testing.T) {
	t.Parallel()

	a := NewAuthProvider(AuthConfig{})

	tokens := &postsfx.OAuthTokens{
		AccessToken: "tok",
	}

	if err := a.SetTokens(nil, tokens); err != nil { //nolint:staticcheck
		t.Fatalf("SetTokens error: %v", err)
	}

	sess := a.CurrentSession()
	if sess == nil {
		t.Fatal("expected non-nil session")
	}

	if sess.DID != "" {
		t.Errorf("expected empty DID for nil PlatformData, got %q", sess.DID)
	}
}
