// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx_test

import (
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

func TestPlatformConstants(t *testing.T) {
	t.Parallel()

	if postsfx.PlatformTwitter != "twitter" {
		t.Errorf("PlatformTwitter = %q, want %q", postsfx.PlatformTwitter, "twitter")
	}

	if postsfx.PlatformBluesky != "bluesky" {
		t.Errorf("PlatformBluesky = %q, want %q", postsfx.PlatformBluesky, "bluesky")
	}
}

func TestSubscriptionTierConstants(t *testing.T) {
	t.Parallel()

	tiers := []postsfx.SubscriptionTier{
		postsfx.SubscriptionFree,
		postsfx.SubscriptionPremium,
		postsfx.SubscriptionPremiumPlus,
		postsfx.SubscriptionBusiness,
	}

	seen := make(map[postsfx.SubscriptionTier]bool)
	for _, tier := range tiers {
		if seen[tier] {
			t.Errorf("duplicate SubscriptionTier value: %q", tier)
		}

		seen[tier] = true
	}
}

func TestPostConstruction(t *testing.T) {
	t.Parallel()

	now := time.Now()
	post := &postsfx.Post{
		ID:           postsfx.PostID("123456789"),
		Text:         "Hello, world!",
		AuthorHandle: postsfx.Handle("eser"),
		Platform:     postsfx.PlatformTwitter,
		CreatedAt:    now,
	}

	if post.Platform != postsfx.PlatformTwitter {
		t.Errorf("expected twitter platform, got %q", post.Platform)
	}

	if post.Text != "Hello, world!" {
		t.Errorf("unexpected text: %q", post.Text)
	}
}

func TestPostWithPlatformRef(t *testing.T) {
	t.Parallel()

	post := &postsfx.Post{
		ID:           postsfx.PostID("at://did:plc:abc/app.bsky.feed.post/xyz"),
		Platform:     postsfx.PlatformBluesky,
		Text:         "Bluesky post",
		AuthorHandle: postsfx.Handle("eser.bsky.social"),
		CreatedAt:    time.Now(),
		PlatformRef: map[string]string{
			"uri": "at://did:plc:abc/app.bsky.feed.post/xyz",
			"cid": "bafyreiabc",
		},
	}

	if post.PlatformRef["cid"] != "bafyreiabc" {
		t.Errorf("unexpected cid: %q", post.PlatformRef["cid"])
	}
}

func TestPostReferencedPosts(t *testing.T) {
	t.Parallel()

	original := postsfx.PostID("original-id")
	reply := &postsfx.Post{
		ID:           postsfx.PostID("reply-id"),
		Text:         "Reply text",
		AuthorHandle: postsfx.Handle("eser"),
		Platform:     postsfx.PlatformTwitter,
		CreatedAt:    time.Now(),
		InReplyToID:  &original,
		ReferencedPosts: []postsfx.ReferencedPost{
			{Type: postsfx.ReferencedPostRepliedTo, ID: original},
		},
	}

	if reply.InReplyToID == nil || *reply.InReplyToID != original {
		t.Error("InReplyToID not set correctly")
	}

	if len(reply.ReferencedPosts) != 1 {
		t.Errorf("expected 1 referenced post, got %d", len(reply.ReferencedPosts))
	}

	if reply.ReferencedPosts[0].Type != postsfx.ReferencedPostRepliedTo {
		t.Errorf("unexpected reference type: %q", reply.ReferencedPosts[0].Type)
	}
}

func TestRegistryRegisterAndGet(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()

	_, ok := reg.Get(postsfx.PlatformTwitter)
	if ok {
		t.Error("expected no adapter before registration")
	}

	// Register a nil adapter (just testing the registry mechanics).
	reg.Register(postsfx.PlatformTwitter, nil)

	api, ok := reg.Get(postsfx.PlatformTwitter)
	if !ok {
		t.Error("expected adapter after registration")
	}

	if api != nil {
		t.Error("expected nil adapter")
	}
}

func TestRegistryPlatforms(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, nil)
	reg.Register(postsfx.PlatformBluesky, nil)

	platforms := reg.Platforms()
	if len(platforms) != 2 {
		t.Errorf("expected 2 platforms, got %d", len(platforms))
	}
}

func TestOAuthTokensOptionalFields(t *testing.T) {
	t.Parallel()

	tokens := &postsfx.OAuthTokens{
		AccessToken: "access-token-value",
	}

	if tokens.RefreshToken != "" {
		t.Error("expected empty refresh token")
	}

	if tokens.ExpiresAt != nil {
		t.Error("expected nil expiry")
	}
}
