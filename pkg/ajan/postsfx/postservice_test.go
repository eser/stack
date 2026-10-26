// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx_test

import (
	"context"
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// stubAdapter is a minimal SocialApi that records calls and returns canned responses.
type stubAdapter struct {
	platform postsfx.Platform
	posts    []*postsfx.Post
	createFn func(ctx context.Context, text string) (*postsfx.Post, error)
}

func (s *stubAdapter) CreatePost(ctx context.Context, text string) (*postsfx.Post, error) {
	if s.createFn != nil {
		return s.createFn(ctx, text)
	}

	p := &postsfx.Post{
		ID:       postsfx.PostID("stub-1"),
		Text:     text,
		Platform: s.platform,
	}

	return p, nil
}

func (s *stubAdapter) DeletePost(_ context.Context, _ postsfx.PostID) error { return nil }
func (s *stubAdapter) GetTimeline(_ context.Context, _ postsfx.GetTimelineOptions) ([]*postsfx.Post, error) {
	return s.posts, nil
}
func (s *stubAdapter) GetMe(_ context.Context) (*postsfx.User, error) {
	return &postsfx.User{ID: "u1", Handle: "stub", Platform: s.platform}, nil
}
func (s *stubAdapter) GetPost(_ context.Context, id postsfx.PostID) (*postsfx.Post, error) {
	return &postsfx.Post{ID: id, Platform: s.platform}, nil
}
func (s *stubAdapter) ReplyToPost(_ context.Context, opts postsfx.ReplyOptions) (*postsfx.Post, error) {
	return &postsfx.Post{ID: "reply-1", Text: opts.Text, Platform: s.platform}, nil
}
func (s *stubAdapter) PostThread(_ context.Context, opts postsfx.ThreadOptions) ([]*postsfx.Post, error) {
	posts := make([]*postsfx.Post, len(opts.Texts))
	for i, t := range opts.Texts {
		posts[i] = &postsfx.Post{ID: postsfx.PostID("t" + string(rune('0'+i))), Text: t}
	}
	return posts, nil
}
func (s *stubAdapter) GetConversation(_ context.Context, _ postsfx.PostID) ([]*postsfx.Post, error) {
	return s.posts, nil
}
func (s *stubAdapter) GetUsage(_ context.Context) (*postsfx.UsageData, error) {
	return &postsfx.UsageData{}, nil
}
func (s *stubAdapter) Repost(_ context.Context, _ postsfx.RepostOptions) error     { return nil }
func (s *stubAdapter) UndoRepost(_ context.Context, _ postsfx.RepostOptions) error { return nil }
func (s *stubAdapter) QuotePost(_ context.Context, opts postsfx.QuotePostOptions) (*postsfx.Post, error) {
	return &postsfx.Post{ID: "q-1", Text: opts.Text, Platform: s.platform}, nil
}
func (s *stubAdapter) SearchPosts(_ context.Context, opts postsfx.SearchOptions) ([]*postsfx.Post, error) {
	return s.posts, nil
}
func (s *stubAdapter) BookmarkPost(_ context.Context, _ postsfx.BookmarkOptions) error   { return nil }
func (s *stubAdapter) RemoveBookmark(_ context.Context, _ postsfx.BookmarkOptions) error { return nil }
func (s *stubAdapter) GetBookmarks(_ context.Context, _ postsfx.GetBookmarksOptions) ([]*postsfx.Post, error) {
	return s.posts, nil
}

// ── PostService tests ─────────────────────────────────────────────────────────

func TestPostService_ComposePost(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	stub := &stubAdapter{platform: postsfx.PlatformTwitter}
	reg.Register(postsfx.PlatformTwitter, stub)

	svc := postsfx.NewPostService(reg)

	platform := postsfx.PlatformTwitter
	post, err := svc.ComposePost(context.Background(), postsfx.ComposeOptions{
		Text:     "hello world",
		Platform: &platform,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if post.Text != "hello world" {
		t.Errorf("unexpected text: %q", post.Text)
	}
}

func TestPostService_ComposePost_NoAdapters(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	svc := postsfx.NewPostService(reg)

	_, err := svc.ComposePost(context.Background(), postsfx.ComposeOptions{Text: "test"})
	if err == nil {
		t.Fatal("expected error when no adapters registered")
	}
}

func TestPostService_ComposePostToAll(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{platform: postsfx.PlatformTwitter})
	reg.Register(postsfx.PlatformBluesky, &stubAdapter{platform: postsfx.PlatformBluesky})

	svc := postsfx.NewPostService(reg)

	results, err := svc.ComposePostToAll(context.Background(), "multi-platform")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}

	for _, r := range results {
		if r.Err != nil {
			t.Errorf("platform %q error: %v", r.Platform, r.Err)
		}
	}
}

func TestPostService_ComposePostToAll_PartialFailure(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{platform: postsfx.PlatformTwitter})
	reg.Register(postsfx.PlatformBluesky, &stubAdapter{
		platform: postsfx.PlatformBluesky,
		createFn: func(_ context.Context, _ string) (*postsfx.Post, error) {
			return nil, errors.New("bluesky down")
		},
	})

	svc := postsfx.NewPostService(reg)

	results, err := svc.ComposePostToAll(context.Background(), "test")
	// Top-level err should be nil — partial failures are in individual results.
	if err != nil {
		t.Fatalf("unexpected top-level error: %v", err)
	}

	failed := 0
	for _, r := range results {
		if r.Err != nil {
			failed++
		}
	}

	if failed != 1 {
		t.Errorf("expected exactly 1 failed result, got %d", failed)
	}
}

func TestPostService_GetUnifiedTimeline(t *testing.T) {
	t.Parallel()

	post1 := &postsfx.Post{ID: "t1", Platform: postsfx.PlatformTwitter}
	post2 := &postsfx.Post{ID: "b1", Platform: postsfx.PlatformBluesky}

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{platform: postsfx.PlatformTwitter, posts: []*postsfx.Post{post1}})
	reg.Register(postsfx.PlatformBluesky, &stubAdapter{platform: postsfx.PlatformBluesky, posts: []*postsfx.Post{post2}})

	svc := postsfx.NewPostService(reg)

	posts, err := svc.GetUnifiedTimeline(context.Background(), 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(posts) != 2 {
		t.Errorf("expected 2 posts from 2 platforms, got %d", len(posts))
	}
}

// ── TokenStore tests ──────────────────────────────────────────────────────────

func TestFileTokenStore_SaveAndLoad(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := postsfx.NewFileTokenStore(dir)
	ctx := context.Background()

	tokens := &postsfx.OAuthTokens{
		AccessToken:  "access-123",
		RefreshToken: "refresh-456",
		PlatformData: map[string]string{"did": "did:plc:test"},
	}

	if err := store.Save(ctx, postsfx.PlatformTwitter, tokens); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := store.Load(ctx, postsfx.PlatformTwitter)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if loaded.AccessToken != tokens.AccessToken {
		t.Errorf("AccessToken: want %q, got %q", tokens.AccessToken, loaded.AccessToken)
	}

	if loaded.RefreshToken != tokens.RefreshToken {
		t.Errorf("RefreshToken: want %q, got %q", tokens.RefreshToken, loaded.RefreshToken)
	}
}

func TestFileTokenStore_LoadNotFound(t *testing.T) {
	t.Parallel()

	store := postsfx.NewFileTokenStore(t.TempDir())

	_, err := store.Load(context.Background(), postsfx.PlatformBluesky)
	if err == nil {
		t.Fatal("expected ErrTokenNotFound")
	}

	if !errors.Is(err, postsfx.ErrTokenNotFound) {
		t.Errorf("expected ErrTokenNotFound, got %v", err)
	}
}

func TestFileTokenStore_Clear(t *testing.T) {
	t.Parallel()

	store := postsfx.NewFileTokenStore(t.TempDir())
	ctx := context.Background()

	_ = store.Save(ctx, postsfx.PlatformTwitter, &postsfx.OAuthTokens{AccessToken: "tok"})

	if err := store.Clear(ctx, postsfx.PlatformTwitter); err != nil {
		t.Fatalf("Clear: %v", err)
	}

	_, err := store.Load(ctx, postsfx.PlatformTwitter)
	if !errors.Is(err, postsfx.ErrTokenNotFound) {
		t.Errorf("expected ErrTokenNotFound after Clear, got %v", err)
	}
}

func TestFileTokenStore_ClearNonExistent(t *testing.T) {
	t.Parallel()

	store := postsfx.NewFileTokenStore(t.TempDir())

	// Clearing a non-existent token should not error.
	if err := store.Clear(context.Background(), postsfx.PlatformBluesky); err != nil {
		t.Errorf("Clear of non-existent token should not error, got: %v", err)
	}
}
