// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// ─── test helpers ────────────────────────────────────────────────────────────

type redirectTransport struct {
	scheme string
	host   string
	base   http.RoundTripper
}

func (t *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.URL.Scheme = t.scheme
	req.URL.Host = t.host

	rt := t.base
	if rt == nil {
		rt = http.DefaultTransport
	}

	return rt.RoundTrip(req)
}

func newTestAdapter(t *testing.T, handler http.Handler) *Adapter {
	t.Helper()

	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("test-bearer-token")
	c.http = &http.Client{
		Transport: &redirectTransport{
			scheme: srvURL.Scheme,
			host:   srvURL.Host,
		},
	}

	return &Adapter{client: c}
}

func newTestAdapterWithMe(t *testing.T, handler http.Handler, me *postsfx.User) *Adapter {
	t.Helper()

	a := newTestAdapter(t, handler)
	a.cachedMe = me

	return a
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

var cachedUser = &postsfx.User{ID: "user123", Handle: "alice"}

// ─── Adapter.GetMe ────────────────────────────────────────────────────────────

func TestAdapter_GetMe(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/me", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiUser]{
			Data: &apiUser{ID: "user123", Name: "Alice", Username: "alice"},
		})
	})

	a := newTestAdapter(t, mux)
	u, err := a.GetMe(context.Background())
	if err != nil {
		t.Fatalf("GetMe error: %v", err)
	}

	if u.ID != "user123" {
		t.Errorf("expected ID='user123', got %q", u.ID)
	}
}

func TestAdapter_GetMe_Cached(t *testing.T) {
	t.Parallel()

	callCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/me", func(w http.ResponseWriter, r *http.Request) {
		callCount++
		writeJSON(w, apiSingleResponse[apiUser]{Data: &apiUser{ID: "user123", Username: "alice"}})
	})

	a := newTestAdapter(t, mux)

	_, _ = a.GetMe(context.Background())
	_, _ = a.GetMe(context.Background())

	if callCount != 1 {
		t.Errorf("expected 1 HTTP call (cache), got %d", callCount)
	}
}

func TestAdapter_GetMe_EmptyData(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/me", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiUser]{Data: nil})
	})

	a := newTestAdapter(t, mux)
	_, err := a.GetMe(context.Background())
	if err == nil {
		t.Error("expected error for nil data response")
	}
}

// ─── Adapter.CreatePost ──────────────────────────────────────────────────────

func TestAdapter_CreatePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{
			Data: &apiTweet{ID: "tweet999", Text: "hello twitter!"},
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.CreatePost(context.Background(), "hello twitter!")
	if err != nil {
		t.Fatalf("CreatePost error: %v", err)
	}

	if string(post.ID) != "tweet999" {
		t.Errorf("expected ID='tweet999', got %q", post.ID)
	}
}

func TestAdapter_CreatePost_EmptyData(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{Data: nil})
	})

	a := newTestAdapter(t, mux)
	_, err := a.CreatePost(context.Background(), "test")
	if err == nil {
		t.Error("expected error for nil tweet data")
	}
}

// ─── Adapter.DeletePost ──────────────────────────────────────────────────────

func TestAdapter_DeletePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/tweet123", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	a := newTestAdapter(t, mux)
	err := a.DeletePost(context.Background(), "tweet123")
	if err != nil {
		t.Fatalf("DeletePost error: %v", err)
	}
}

// ─── Adapter.GetTimeline ─────────────────────────────────────────────────────

func TestAdapter_GetTimeline(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{
			Data: []apiTweet{
				{ID: "t1", Text: "timeline tweet 1"},
				{ID: "t2", Text: "timeline tweet 2"},
			},
		})
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	posts, err := a.GetTimeline(context.Background(), postsfx.GetTimelineOptions{MaxResults: 10})
	if err != nil {
		t.Fatalf("GetTimeline error: %v", err)
	}

	if len(posts) != 2 {
		t.Fatalf("expected 2 posts, got %d", len(posts))
	}
}

func TestAdapter_GetTimeline_WithIncludes(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{
			Data: []apiTweet{
				{ID: "t1", Text: "tweet by alice", AuthorID: "user123"},
			},
			Includes: &apiIncludes{
				Users: []apiUser{{ID: "user123", Username: "alice"}},
			},
		})
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	posts, err := a.GetTimeline(context.Background(), postsfx.GetTimelineOptions{})
	if err != nil {
		t.Fatalf("GetTimeline error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}

	if string(posts[0].AuthorHandle) != "alice" {
		t.Errorf("expected author 'alice', got %q", posts[0].AuthorHandle)
	}
}

// ─── Adapter.GetPost ─────────────────────────────────────────────────────────

func TestAdapter_GetPost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/tweet456", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{
			Data: &apiTweet{ID: "tweet456", Text: "fetched tweet"},
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.GetPost(context.Background(), "tweet456")
	if err != nil {
		t.Fatalf("GetPost error: %v", err)
	}

	if post.Text != "fetched tweet" {
		t.Errorf("expected 'fetched tweet', got %q", post.Text)
	}
}

func TestAdapter_GetPost_NotFound(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/notexist", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{Data: nil})
	})

	a := newTestAdapter(t, mux)
	_, err := a.GetPost(context.Background(), "notexist")
	if err == nil {
		t.Error("expected error for nil tweet data")
	}
}

// ─── Adapter.ReplyToPost ─────────────────────────────────────────────────────

func TestAdapter_ReplyToPost_NilTarget(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok")}
	_, err := a.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "reply",
		InReplyToPost: nil,
	})
	if err == nil {
		t.Error("expected error for nil InReplyToPost")
	}
}

func TestAdapter_ReplyToPost_Success(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{
			Data: &apiTweet{ID: "reply001", Text: "my reply"},
		})
	})

	a := newTestAdapter(t, mux)
	parent := &postsfx.Post{ID: "parent001"}

	post, err := a.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "my reply",
		InReplyToPost: parent,
	})
	if err != nil {
		t.Fatalf("ReplyToPost error: %v", err)
	}

	if string(post.ID) != "reply001" {
		t.Errorf("expected ID='reply001', got %q", post.ID)
	}
}

func TestAdapter_ReplyToPost_EmptyData(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{Data: nil})
	})

	a := newTestAdapter(t, mux)
	parent := &postsfx.Post{ID: "parent001"}

	_, err := a.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "reply",
		InReplyToPost: parent,
	})
	if err == nil {
		t.Error("expected error for nil reply data")
	}
}

// ─── Adapter.PostThread ──────────────────────────────────────────────────────

func TestAdapter_PostThread_EmptyTexts(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok")}
	_, err := a.PostThread(context.Background(), postsfx.ThreadOptions{Texts: []string{}})
	if err == nil {
		t.Error("expected error for empty texts")
	}
}

func TestAdapter_PostThread_Success(t *testing.T) {
	t.Parallel()

	callN := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		callN++
		writeJSON(w, apiSingleResponse[apiTweet]{
			Data: &apiTweet{ID: "tweet" + string(rune('0'+callN)), Text: "post"},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.PostThread(context.Background(), postsfx.ThreadOptions{
		Texts: []string{"first", "second"},
	})
	if err != nil {
		t.Fatalf("PostThread error: %v", err)
	}

	if len(posts) != 2 {
		t.Fatalf("expected 2 posts, got %d", len(posts))
	}
}

// ─── Adapter.GetConversation ──────────────────────────────────────────────────

func TestAdapter_GetConversation(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/search/recent", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{
			Data: []apiTweet{
				{ID: "t1", Text: "conv tweet 1"},
				{ID: "t2", Text: "conv tweet 2"},
			},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.GetConversation(context.Background(), "conv123")
	if err != nil {
		t.Fatalf("GetConversation error: %v", err)
	}

	if len(posts) != 2 {
		t.Fatalf("expected 2 posts, got %d", len(posts))
	}
}

// ─── Adapter.GetUsage ────────────────────────────────────────────────────────

func TestAdapter_GetUsage(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/usage/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiUsageResponse{
			Data: &apiUsageData{
				AppID: "myapp",
				DailyProjectUsage: []apiDailyUsage{
					{
						Date: "2024-01-01",
						UsageData: []apiUsageEntry{
							{
								AppID:       "myapp",
								UsageResult: []apiUsageResult{{CallCount: 42}},
							},
						},
					},
				},
			},
		})
	})

	a := newTestAdapter(t, mux)
	usage, err := a.GetUsage(context.Background())
	if err != nil {
		t.Fatalf("GetUsage error: %v", err)
	}

	if usage.TotalCalls != 42 {
		t.Errorf("expected TotalCalls=42, got %d", usage.TotalCalls)
	}

	if len(usage.Daily) != 1 {
		t.Fatalf("expected 1 daily entry, got %d", len(usage.Daily))
	}
}

func TestAdapter_GetUsage_NilData(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/usage/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiUsageResponse{Data: nil})
	})

	a := newTestAdapter(t, mux)
	usage, err := a.GetUsage(context.Background())
	if err != nil {
		t.Fatalf("GetUsage error: %v", err)
	}

	if usage.TotalCalls != 0 {
		t.Errorf("expected 0 total calls for nil data, got %d", usage.TotalCalls)
	}
}

// ─── Adapter.Repost ───────────────────────────────────────────────────────────

func TestAdapter_Repost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/retweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]bool{"retweeted": true})
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	err := a.Repost(context.Background(), postsfx.RepostOptions{ID: "tweet999"})
	if err != nil {
		t.Fatalf("Repost error: %v", err)
	}
}

// ─── Adapter.UndoRepost ───────────────────────────────────────────────────────

func TestAdapter_UndoRepost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/retweets/tweet999", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	err := a.UndoRepost(context.Background(), postsfx.RepostOptions{ID: "tweet999"})
	if err != nil {
		t.Fatalf("UndoRepost error: %v", err)
	}
}

// ─── Adapter.QuotePost ────────────────────────────────────────────────────────

func TestAdapter_QuotePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{
			Data: &apiTweet{ID: "quote001", Text: "my quote"},
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.QuotePost(context.Background(), postsfx.QuotePostOptions{
		QuotedPostID: "original001",
		Text:         "my quote",
	})
	if err != nil {
		t.Fatalf("QuotePost error: %v", err)
	}

	if string(post.ID) != "quote001" {
		t.Errorf("expected ID='quote001', got %q", post.ID)
	}
}

func TestAdapter_QuotePost_EmptyData(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSingleResponse[apiTweet]{Data: nil})
	})

	a := newTestAdapter(t, mux)
	_, err := a.QuotePost(context.Background(), postsfx.QuotePostOptions{
		QuotedPostID: "original001",
		Text:         "my quote",
	})
	if err == nil {
		t.Error("expected error for nil tweet data")
	}
}

// ─── Adapter.SearchPosts ─────────────────────────────────────────────────────

func TestAdapter_SearchPosts(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/search/recent", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{
			Data: []apiTweet{
				{ID: "s1", Text: "search result 1"},
			},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.SearchPosts(context.Background(), postsfx.SearchOptions{
		Query:      "test",
		MaxResults: 5,
	})
	if err != nil {
		t.Fatalf("SearchPosts error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

func TestAdapter_SearchPosts_NoLimit(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/search/recent", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.SearchPosts(context.Background(), postsfx.SearchOptions{Query: "test"})
	if err != nil {
		t.Fatalf("SearchPosts error: %v", err)
	}

	if len(posts) != 0 {
		t.Errorf("expected 0 posts, got %d", len(posts))
	}
}

// ─── Adapter.BookmarkPost ────────────────────────────────────────────────────

func TestAdapter_BookmarkPost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/bookmarks", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]bool{"bookmarked": true})
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	err := a.BookmarkPost(context.Background(), postsfx.BookmarkOptions{ID: "tweet999"})
	if err != nil {
		t.Fatalf("BookmarkPost error: %v", err)
	}
}

// ─── Adapter.RemoveBookmark ───────────────────────────────────────────────────

func TestAdapter_RemoveBookmark(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/bookmarks/tweet999", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	err := a.RemoveBookmark(context.Background(), postsfx.BookmarkOptions{ID: "tweet999"})
	if err != nil {
		t.Fatalf("RemoveBookmark error: %v", err)
	}
}

// ─── Adapter.GetBookmarks ─────────────────────────────────────────────────────

func TestAdapter_GetBookmarks(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/users/user123/bookmarks", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListResponse[apiTweet]{
			Data: []apiTweet{
				{ID: "bm1", Text: "bookmarked tweet"},
			},
		})
	})

	a := newTestAdapterWithMe(t, mux, cachedUser)
	posts, err := a.GetBookmarks(context.Background(), postsfx.GetBookmarksOptions{MaxResults: 10})
	if err != nil {
		t.Fatalf("GetBookmarks error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

// ─── parseDate ───────────────────────────────────────────────────────────────

func TestParseDate_Valid(t *testing.T) {
	t.Parallel()

	d := parseDate("2024-03-15")

	expected := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)
	if !d.Equal(expected) {
		t.Errorf("expected %v, got %v", expected, d)
	}
}

func TestParseDate_Invalid(t *testing.T) {
	t.Parallel()

	d := parseDate("not-a-date")
	if !d.IsZero() {
		t.Errorf("expected zero time for invalid date, got %v", d)
	}
}

// ─── client methods ───────────────────────────────────────────────────────────

func TestClient_RoundTrip_HTTPError(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/bad", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	err := c.get(context.Background(), "/tweets/bad", nil)
	if err == nil {
		t.Error("expected error for HTTP 404")
	}
}

func TestClient_RoundTrip_RateLimit(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/rl", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "1")
		w.WriteHeader(http.StatusTooManyRequests)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := c.get(ctx, "/tweets/rl", nil)
	if err == nil {
		t.Error("expected error after rate limit retries")
	}
}

func TestRateLimitError_Error(t *testing.T) {
	t.Parallel()

	e := &rateLimitError{retryAfter: "30"}
	if e.Error() == "" {
		t.Error("expected non-empty error message")
	}
}

func TestIsRateLimitError(t *testing.T) {
	t.Parallel()

	rle := &rateLimitError{retryAfter: "5"}
	if !isRateLimitError(rle) {
		t.Error("expected true for rateLimitError")
	}

	if isRateLimitError(nil) {
		t.Error("expected false for nil error")
	}
}

func TestRetryAfter_WithSeconds(t *testing.T) {
	t.Parallel()

	d := retryAfter(&rateLimitError{retryAfter: "20"})
	if d != 20*time.Second {
		t.Errorf("expected 20s, got %v", d)
	}
}

func TestRetryAfter_EmptyRetryAfter(t *testing.T) {
	t.Parallel()

	d := retryAfter(&rateLimitError{retryAfter: ""})
	if d != 5*time.Second {
		t.Errorf("expected 5s default, got %v", d)
	}
}

func TestRetryAfter_InvalidRetryAfter(t *testing.T) {
	t.Parallel()

	d := retryAfter(&rateLimitError{retryAfter: "not-a-number"})
	if d != 5*time.Second {
		t.Errorf("expected 5s default, got %v", d)
	}
}

func TestRetryAfter_NonRateLimitError(t *testing.T) {
	t.Parallel()

	d := retryAfter(nil)
	if d != 5*time.Second {
		t.Errorf("expected 5s default for non-rate-limit error, got %v", d)
	}
}

func TestClient_PostForm(t *testing.T) {
	t.Parallel()

	var receivedContentType string
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		receivedContentType = r.Header.Get("Content-Type")
		writeJSON(w, apiTokenResponse{
			AccessToken: "new-token",
			TokenType:   "bearer",
		})
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	var dst apiTokenResponse
	err := c.postForm(context.Background(), srv.URL+"/token", map[string]string{
		"grant_type": "client_credentials",
	}, &dst)
	if err != nil {
		t.Fatalf("postForm error: %v", err)
	}

	if receivedContentType != "application/x-www-form-urlencoded" {
		t.Errorf("expected form content type, got %q", receivedContentType)
	}

	if dst.AccessToken != "new-token" {
		t.Errorf("expected 'new-token', got %q", dst.AccessToken)
	}
}

func TestClient_Delete(t *testing.T) {
	t.Parallel()

	var receivedMethod string
	mux := http.NewServeMux()
	mux.HandleFunc("/2/tweets/del123", func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		w.WriteHeader(http.StatusNoContent)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	err := c.delete(context.Background(), "/tweets/del123")
	if err != nil {
		t.Fatalf("delete error: %v", err)
	}

	if receivedMethod != http.MethodDelete {
		t.Errorf("expected DELETE, got %q", receivedMethod)
	}
}
