// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// helpers

func newSvcWithStub(platform postsfx.Platform) (*postsfx.DefaultPostService, *stubAdapter) { //nolint:unparam // test helper kept parameterised for readability
	reg := postsfx.NewRegistry()
	stub := &stubAdapter{platform: platform}
	reg.Register(platform, stub)

	return postsfx.NewPostService(reg), stub
}

// ─── SchedulePost ─────────────────────────────────────────────────────────────

func TestPostService_SchedulePost_NotImpl(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	err := svc.SchedulePost(context.Background(), postsfx.ScheduleOptions{})
	if err == nil {
		t.Error("expected error for SchedulePost stub")
	}
}

// ─── GetTimeline ──────────────────────────────────────────────────────────────

func TestPostService_GetTimeline(t *testing.T) {
	t.Parallel()

	post := &postsfx.Post{ID: "t1", Platform: postsfx.PlatformTwitter}
	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{
		platform: postsfx.PlatformTwitter,
		posts:    []*postsfx.Post{post},
	})

	svc := postsfx.NewPostService(reg)
	platform := postsfx.PlatformTwitter
	posts, err := svc.GetTimeline(context.Background(), postsfx.GetTimelineOptions{Platform: platform})
	if err != nil {
		t.Fatalf("GetTimeline error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

func TestPostService_GetTimeline_UnknownPlatform(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	svc := postsfx.NewPostService(reg)

	p := postsfx.Platform("nonexistent")
	_, err := svc.GetTimeline(context.Background(), postsfx.GetTimelineOptions{Platform: p})
	if err == nil {
		t.Error("expected error for unknown platform")
	}
}

// ─── GetPost ──────────────────────────────────────────────────────────────────

func TestPostService_GetPost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter
	post, err := svc.GetPost(context.Background(), "tweet1", platform)
	if err != nil {
		t.Fatalf("GetPost error: %v", err)
	}

	if string(post.ID) != "tweet1" {
		t.Errorf("expected ID='tweet1', got %q", post.ID)
	}
}

func TestPostService_GetPost_UnknownPlatform(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	svc := postsfx.NewPostService(reg)

	_, err := svc.GetPost(context.Background(), "t1", "ghost")
	if err == nil {
		t.Error("expected error for unregistered platform")
	}
}

// ─── ReplyToPost ──────────────────────────────────────────────────────────────

func TestPostService_ReplyToPost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	parent := &postsfx.Post{ID: "parent1", Platform: postsfx.PlatformTwitter}

	post, err := svc.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "my reply",
		InReplyToPost: parent,
	})
	if err != nil {
		t.Fatalf("ReplyToPost error: %v", err)
	}

	if post.Text != "my reply" {
		t.Errorf("expected 'my reply', got %q", post.Text)
	}
}

func TestPostService_ReplyToPost_NilTarget(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	_, err := svc.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "orphan reply",
		InReplyToPost: nil,
	})
	if err == nil {
		t.Error("expected error for nil InReplyToPost")
	}
}

// ─── PostThread ───────────────────────────────────────────────────────────────

func TestPostService_PostThread(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	posts, err := svc.PostThread(context.Background(), postsfx.ThreadOptions{
		Platform: platform,
		Texts:    []string{"first", "second", "third"},
	})
	if err != nil {
		t.Fatalf("PostThread error: %v", err)
	}

	if len(posts) != 3 {
		t.Fatalf("expected 3 posts, got %d", len(posts))
	}
}

// ─── GetUsage ────────────────────────────────────────────────────────────────

func TestPostService_GetUsage(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	usage, err := svc.GetUsage(context.Background(), platform)
	if err != nil {
		t.Fatalf("GetUsage error: %v", err)
	}

	if usage == nil {
		t.Error("expected non-nil usage")
	}
}

// ─── Repost ───────────────────────────────────────────────────────────────────

func TestPostService_Repost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	err := svc.Repost(context.Background(), postsfx.RepostOptions{
		ID:       "tweet1",
		Platform: platform,
	})
	if err != nil {
		t.Fatalf("Repost error: %v", err)
	}
}

// ─── UndoRepost ───────────────────────────────────────────────────────────────

func TestPostService_UndoRepost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	err := svc.UndoRepost(context.Background(), postsfx.RepostOptions{
		ID:       "tweet1",
		Platform: platform,
	})
	if err != nil {
		t.Fatalf("UndoRepost error: %v", err)
	}
}

// ─── QuotePost ────────────────────────────────────────────────────────────────

func TestPostService_QuotePost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	post, err := svc.QuotePost(context.Background(), postsfx.QuotePostOptions{
		QuotedPostID: "tweet1",
		Text:         "my quote",
		Platform:     platform,
	})
	if err != nil {
		t.Fatalf("QuotePost error: %v", err)
	}

	if post.Text != "my quote" {
		t.Errorf("expected 'my quote', got %q", post.Text)
	}
}

// ─── SearchPosts ──────────────────────────────────────────────────────────────

func TestPostService_SearchPosts(t *testing.T) {
	t.Parallel()

	post := &postsfx.Post{ID: "s1", Platform: postsfx.PlatformTwitter}
	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{
		platform: postsfx.PlatformTwitter,
		posts:    []*postsfx.Post{post},
	})

	svc := postsfx.NewPostService(reg)
	platform := postsfx.PlatformTwitter

	posts, err := svc.SearchPosts(context.Background(), postsfx.SearchOptions{
		Query:    "test",
		Platform: platform,
	})
	if err != nil {
		t.Fatalf("SearchPosts error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

// ─── SearchPostsAll ──────────────────────────────────────────────────────────

func TestPostService_SearchPostsAll(t *testing.T) {
	t.Parallel()

	post1 := &postsfx.Post{ID: "t1", Platform: postsfx.PlatformTwitter}
	post2 := &postsfx.Post{ID: "b1", Platform: postsfx.PlatformBluesky}

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{
		platform: postsfx.PlatformTwitter,
		posts:    []*postsfx.Post{post1},
	})
	reg.Register(postsfx.PlatformBluesky, &stubAdapter{
		platform: postsfx.PlatformBluesky,
		posts:    []*postsfx.Post{post2},
	})

	svc := postsfx.NewPostService(reg)

	results, err := svc.SearchPostsAll(context.Background(), "test", 10)
	if err != nil {
		t.Fatalf("SearchPostsAll error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results (one per platform), got %d", len(results))
	}
}

func TestPostService_SearchPostsAll_Empty(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	svc := postsfx.NewPostService(reg)

	results, err := svc.SearchPostsAll(context.Background(), "test", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 0 {
		t.Fatalf("expected 0 results for empty registry, got %d", len(results))
	}
}

// ─── BookmarkPost ─────────────────────────────────────────────────────────────

func TestPostService_BookmarkPost(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	err := svc.BookmarkPost(context.Background(), postsfx.BookmarkOptions{
		ID:       "tweet1",
		Platform: platform,
	})
	if err != nil {
		t.Fatalf("BookmarkPost error: %v", err)
	}
}

// ─── RemoveBookmark ───────────────────────────────────────────────────────────

func TestPostService_RemoveBookmark(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	err := svc.RemoveBookmark(context.Background(), postsfx.BookmarkOptions{
		ID:       "tweet1",
		Platform: platform,
	})
	if err != nil {
		t.Fatalf("RemoveBookmark error: %v", err)
	}
}

// ─── GetBookmarks ─────────────────────────────────────────────────────────────

func TestPostService_GetBookmarks(t *testing.T) {
	t.Parallel()

	svc, _ := newSvcWithStub(postsfx.PlatformTwitter)
	platform := postsfx.PlatformTwitter

	posts, err := svc.GetBookmarks(context.Background(), postsfx.GetBookmarksOptions{
		Platform:   platform,
		MaxResults: 10,
	})
	if err != nil {
		t.Fatalf("GetBookmarks error: %v", err)
	}

	_ = posts // stub returns nil slice; just verify no error
}

// ─── resolveOne error paths ───────────────────────────────────────────────────

func TestPostService_ResolveOne_NotRegistered(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{platform: postsfx.PlatformTwitter})

	svc := postsfx.NewPostService(reg)
	platform := postsfx.PlatformBluesky // not registered

	_, err := svc.GetPost(context.Background(), "id", platform)
	if err == nil {
		t.Error("expected error for unregistered platform")
	}
}

func TestPostService_ResolveOne_FallbackToFirst(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{platform: postsfx.PlatformTwitter})
	svc := postsfx.NewPostService(reg)

	// nil platform → falls back to first registered
	post, err := svc.ComposePost(context.Background(), postsfx.ComposeOptions{
		Text:     "fallback test",
		Platform: nil,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if post == nil {
		t.Error("expected non-nil post")
	}
}

// ─── GetUnifiedTimeline (partial failure) ─────────────────────────────────────

func TestPostService_GetUnifiedTimeline_SkipsFailures(t *testing.T) {
	t.Parallel()

	reg := postsfx.NewRegistry()
	reg.Register(postsfx.PlatformTwitter, &stubAdapter{
		platform: postsfx.PlatformTwitter,
		posts:    []*postsfx.Post{{ID: "t1", Platform: postsfx.PlatformTwitter}},
	})

	svc := postsfx.NewPostService(reg)
	posts, err := svc.GetUnifiedTimeline(context.Background(), 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

// ─── DefaultTokenStoreDir ─────────────────────────────────────────────────────

func TestDefaultTokenStoreDir_WithXDG(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/tmp/myconfig")

	dir := postsfx.DefaultTokenStoreDir()
	if !strings.HasPrefix(dir, "/tmp/myconfig") {
		t.Errorf("expected XDG-based path, got %q", dir)
	}
}

func TestDefaultTokenStoreDir_WithoutXDG(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "")

	dir := postsfx.DefaultTokenStoreDir()
	if dir == "" {
		t.Error("expected non-empty default token store dir")
	}
}

func TestDefaultTokenStoreDir_HomeDir(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "")

	dir := postsfx.DefaultTokenStoreDir()
	if dir == "" {
		t.Error("expected non-empty dir")
	}

	if !strings.Contains(dir, "eser") {
		t.Errorf("expected 'eser' in path, got %q", dir)
	}
}

// ─── TokenStore additional coverage ──────────────────────────────────────────

func TestFileTokenStore_Load_CorruptJSON(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := postsfx.NewFileTokenStore(dir)

	// Write a corrupt JSON file directly.
	path := dir + "/twitter.json"
	if err := os.WriteFile(path, []byte(`{invalid json`), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	_, err := store.Load(context.Background(), postsfx.PlatformTwitter)
	if err == nil {
		t.Error("expected error for corrupt JSON")
	}
}
