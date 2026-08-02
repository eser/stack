// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

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

// redirectTransport rewrites all requests to target the given test server.
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
	c := newClient("test-jwt")
	c.http = &http.Client{
		Transport: &redirectTransport{
			scheme: srvURL.Scheme,
			host:   srvURL.Host,
		},
	}

	return &Adapter{client: c, did: "did:plc:test123"}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// ─── Adapter.GetMe ────────────────────────────────────────────────────────────

func TestAdapter_GetMe(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.actor.getProfile", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiProfile{
			DID:         "did:plc:test123",
			Handle:      "alice.bsky.social",
			DisplayName: "Alice",
		})
	})

	a := newTestAdapter(t, mux)
	u, err := a.GetMe(context.Background())
	if err != nil {
		t.Fatalf("GetMe error: %v", err)
	}

	if string(u.Handle) != "alice.bsky.social" {
		t.Errorf("expected handle 'alice.bsky.social', got %q", u.Handle)
	}
}

func TestAdapter_GetMe_Cached(t *testing.T) {
	t.Parallel()

	callCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.actor.getProfile", func(w http.ResponseWriter, r *http.Request) {
		callCount++
		writeJSON(w, apiProfile{DID: "did:plc:test123", Handle: "alice.bsky.social"})
	})

	a := newTestAdapter(t, mux)

	_, _ = a.GetMe(context.Background())
	_, _ = a.GetMe(context.Background()) // should hit cache

	if callCount != 1 {
		t.Errorf("expected exactly 1 HTTP call (cache hit), got %d", callCount)
	}
}

func TestAdapter_GetMe_EmptyDID(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok"), did: ""}
	_, err := a.GetMe(context.Background())
	if err == nil {
		t.Error("expected error for empty DID")
	}
}

// ─── Adapter.CreatePost ──────────────────────────────────────────────────────

func TestAdapter_CreatePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/com.atproto.repo.createRecord", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiCreateRecordResponse{
			URI: "at://did:plc:test123/app.bsky.feed.post/newkey",
			CID: "bafycid-new",
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.CreatePost(context.Background(), "hello bluesky!")
	if err != nil {
		t.Fatalf("CreatePost error: %v", err)
	}

	if post.Text != "hello bluesky!" {
		t.Errorf("expected 'hello bluesky!', got %q", post.Text)
	}

	if post.Platform != postsfx.PlatformBluesky {
		t.Errorf("expected PlatformBluesky, got %q", post.Platform)
	}

	if post.PlatformRef["cid"] != "bafycid-new" {
		t.Errorf("expected cid='bafycid-new', got %q", post.PlatformRef["cid"])
	}
}

// ─── Adapter.DeletePost ──────────────────────────────────────────────────────

func TestAdapter_DeletePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/com.atproto.repo.deleteRecord", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	a := newTestAdapter(t, mux)
	err := a.DeletePost(context.Background(), "at://did/collection/therkey")
	if err != nil {
		t.Fatalf("DeletePost error: %v", err)
	}
}

func TestAdapter_DeletePost_BadURI(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok"), did: "did:test"}
	err := a.DeletePost(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty URI (no rkey)")
	}
}

// ─── Adapter.GetTimeline ─────────────────────────────────────────────────────

func TestAdapter_GetTimeline(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getTimeline", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiGetTimelineResponse{
			Feed: []apiFeedPost{
				{
					Post: apiPostView{
						URI:    "at://did/coll/key1",
						Author: apiProfile{Handle: "alice.bsky.social"},
						Record: apiPostViewRecord{Text: "timeline post 1"},
					},
				},
			},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.GetTimeline(context.Background(), postsfx.GetTimelineOptions{MaxResults: 10})
	if err != nil {
		t.Fatalf("GetTimeline error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}

	if posts[0].Text != "timeline post 1" {
		t.Errorf("expected 'timeline post 1', got %q", posts[0].Text)
	}
}

func TestAdapter_GetTimeline_NoLimit(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getTimeline", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiGetTimelineResponse{})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.GetTimeline(context.Background(), postsfx.GetTimelineOptions{})
	if err != nil {
		t.Fatalf("GetTimeline error: %v", err)
	}

	if len(posts) != 0 {
		t.Errorf("expected 0 posts, got %d", len(posts))
	}
}

// ─── Adapter.GetPost ─────────────────────────────────────────────────────────

func TestAdapter_GetPost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getPosts", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiGetPostsResponse{
			Posts: []apiPostView{
				{
					URI:    "at://did/coll/key1",
					Author: apiProfile{Handle: "alice.bsky.social"},
					Record: apiPostViewRecord{Text: "fetched post"},
				},
			},
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.GetPost(context.Background(), "at://did/coll/key1")
	if err != nil {
		t.Fatalf("GetPost error: %v", err)
	}

	if post.Text != "fetched post" {
		t.Errorf("expected 'fetched post', got %q", post.Text)
	}
}

func TestAdapter_GetPost_NotFound(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getPosts", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiGetPostsResponse{Posts: []apiPostView{}})
	})

	a := newTestAdapter(t, mux)
	_, err := a.GetPost(context.Background(), "at://did/coll/notexist")
	if err == nil {
		t.Error("expected error for empty posts response")
	}
}

// ─── Adapter.GetConversation ──────────────────────────────────────────────────

func TestAdapter_GetConversation(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getPostThread", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiThreadResponse{
			Thread: apiThreadView{
				Post: apiPostView{
					URI:    "at://did/coll/root",
					Author: apiProfile{Handle: "alice.bsky.social"},
					Record: apiPostViewRecord{Text: "thread root"},
				},
				Replies: []apiThreadView{
					{
						Post: apiPostView{
							URI:    "at://did/coll/reply1",
							Author: apiProfile{Handle: "bob.bsky.social"},
							Record: apiPostViewRecord{Text: "reply"},
						},
					},
				},
			},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.GetConversation(context.Background(), "at://did/coll/root")
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

	a := &Adapter{client: newClient("tok"), did: "did:test"}
	usage, err := a.GetUsage(context.Background())
	if err != nil {
		t.Fatalf("GetUsage error: %v", err)
	}

	if usage == nil {
		t.Error("expected non-nil usage")
	}
}

// ─── Adapter.Bookmark methods ─────────────────────────────────────────────────

func TestAdapter_BookmarkPost_Unsupported(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok")}
	err := a.BookmarkPost(context.Background(), postsfx.BookmarkOptions{})
	if err == nil {
		t.Error("expected error for unsupported BookmarkPost")
	}
}

func TestAdapter_RemoveBookmark_Unsupported(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok")}
	err := a.RemoveBookmark(context.Background(), postsfx.BookmarkOptions{})
	if err == nil {
		t.Error("expected error for unsupported RemoveBookmark")
	}
}

func TestAdapter_GetBookmarks_Unsupported(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok")}
	_, err := a.GetBookmarks(context.Background(), postsfx.GetBookmarksOptions{})
	if err == nil {
		t.Error("expected error for unsupported GetBookmarks")
	}
}

// ─── Adapter.ReplyToPost ─────────────────────────────────────────────────────

func TestAdapter_ReplyToPost_NilTarget(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok"), did: "did:test"}
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
	mux.HandleFunc("/xrpc/com.atproto.repo.createRecord", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiCreateRecordResponse{
			URI: "at://did/coll/replykey",
			CID: "bafycid-reply",
		})
	})

	a := newTestAdapter(t, mux)
	parent := &postsfx.Post{
		ID:          "at://did/coll/parentkey",
		PlatformRef: map[string]string{"cid": "bafycid-parent"},
	}

	post, err := a.ReplyToPost(context.Background(), postsfx.ReplyOptions{
		Text:          "my reply",
		InReplyToPost: parent,
	})
	if err != nil {
		t.Fatalf("ReplyToPost error: %v", err)
	}

	if post.InReplyToID == nil {
		t.Error("expected InReplyToID to be set")
	}
}

// ─── Adapter.PostThread ──────────────────────────────────────────────────────

func TestAdapter_PostThread_EmptyTexts(t *testing.T) {
	t.Parallel()

	a := &Adapter{client: newClient("tok"), did: "did:test"}
	_, err := a.PostThread(context.Background(), postsfx.ThreadOptions{Texts: []string{}})
	if err == nil {
		t.Error("expected error for empty texts")
	}
}

func TestAdapter_PostThread_Success(t *testing.T) {
	t.Parallel()

	callN := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/com.atproto.repo.createRecord", func(w http.ResponseWriter, r *http.Request) {
		callN++
		writeJSON(w, apiCreateRecordResponse{
			URI: "at://did/coll/post" + string(rune('0'+callN)),
			CID: "bafycid",
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

// ─── Adapter.SearchPosts ─────────────────────────────────────────────────────

func TestAdapter_SearchPosts(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.searchPosts", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiSearchPostsResponse{
			Posts: []apiPostView{
				{
					URI:    "at://did/coll/result1",
					Author: apiProfile{Handle: "user.bsky.social"},
					Record: apiPostViewRecord{Text: "search result"},
				},
			},
		})
	})

	a := newTestAdapter(t, mux)
	posts, err := a.SearchPosts(context.Background(), postsfx.SearchOptions{
		Query:      "testquery",
		MaxResults: 5,
	})
	if err != nil {
		t.Fatalf("SearchPosts error: %v", err)
	}

	if len(posts) != 1 {
		t.Fatalf("expected 1 post, got %d", len(posts))
	}
}

// ─── Adapter.Repost ───────────────────────────────────────────────────────────

func TestAdapter_Repost_Success(t *testing.T) {
	t.Parallel()

	callN := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getPosts", func(w http.ResponseWriter, r *http.Request) {
		callN++
		writeJSON(w, apiGetPostsResponse{
			Posts: []apiPostView{
				{
					URI:    "at://did/coll/original",
					CID:    "bafycid-orig",
					Author: apiProfile{Handle: "author.bsky.social"},
					Record: apiPostViewRecord{Text: "original post"},
				},
			},
		})
	})
	mux.HandleFunc("/xrpc/com.atproto.repo.createRecord", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	a := newTestAdapter(t, mux)
	err := a.Repost(context.Background(), postsfx.RepostOptions{ID: "at://did/coll/original"})
	if err != nil {
		t.Fatalf("Repost error: %v", err)
	}
}

// ─── Adapter.UndoRepost ───────────────────────────────────────────────────────

func TestAdapter_UndoRepost_Found(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/com.atproto.repo.listRecords", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListRecordsResponse{
			Records: []apiListRecord{
				{
					URI: "at://did/app.bsky.feed.repost/rkey1",
					Value: apiRepostRecordVal{
						Subject: apiRef{URI: "at://did/coll/original"},
					},
				},
			},
		})
	})
	mux.HandleFunc("/xrpc/com.atproto.repo.deleteRecord", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	a := newTestAdapter(t, mux)
	err := a.UndoRepost(context.Background(), postsfx.RepostOptions{ID: "at://did/coll/original"})
	if err != nil {
		t.Fatalf("UndoRepost error: %v", err)
	}
}

func TestAdapter_UndoRepost_NotFound(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/com.atproto.repo.listRecords", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiListRecordsResponse{Records: []apiListRecord{}})
	})

	a := newTestAdapter(t, mux)
	err := a.UndoRepost(context.Background(), postsfx.RepostOptions{ID: "at://did/coll/notexist"})
	if err == nil {
		t.Error("expected error when repost not found")
	}
}

// ─── Adapter.QuotePost ────────────────────────────────────────────────────────

func TestAdapter_QuotePost(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/app.bsky.feed.getPosts", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiGetPostsResponse{
			Posts: []apiPostView{
				{
					URI:    "at://did/coll/quoted",
					CID:    "bafycid-quoted",
					Author: apiProfile{Handle: "original.bsky.social"},
					Record: apiPostViewRecord{Text: "original to quote"},
				},
			},
		})
	})
	mux.HandleFunc("/xrpc/com.atproto.repo.createRecord", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, apiCreateRecordResponse{
			URI: "at://did/coll/quote-post",
			CID: "bafycid-quote",
		})
	})

	a := newTestAdapter(t, mux)
	post, err := a.QuotePost(context.Background(), postsfx.QuotePostOptions{
		QuotedPostID: "at://did/coll/quoted",
		Text:         "my quote comment",
	})
	if err != nil {
		t.Fatalf("QuotePost error: %v", err)
	}

	if post.Text != "my quote comment" {
		t.Errorf("expected 'my quote comment', got %q", post.Text)
	}
}

// ─── client methods ───────────────────────────────────────────────────────────

func TestClient_RoundTrip_HTTPError(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/some.method", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	err := c.query(context.Background(), "some.method", nil, nil)
	if err == nil {
		t.Error("expected error for HTTP 403")
	}
}

func TestClient_RoundTrip_RateLimit(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/some.method", func(w http.ResponseWriter, r *http.Request) {
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

	err := c.query(ctx, "some.method", nil, nil)
	if err == nil {
		t.Error("expected error after rate limit retries")
	}
}

func TestRateLimitError_Error(t *testing.T) {
	t.Parallel()

	e := &rateLimitError{retryAfter: "60"}
	msg := e.Error()

	if msg == "" {
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

func TestRetryAfterDuration_WithSeconds(t *testing.T) {
	t.Parallel()

	d := retryAfterDuration(&rateLimitError{retryAfter: "10"})
	if d != 10*time.Second {
		t.Errorf("expected 10s, got %v", d)
	}
}

func TestRetryAfterDuration_EmptyRetryAfter(t *testing.T) {
	t.Parallel()

	d := retryAfterDuration(&rateLimitError{retryAfter: ""})
	if d != 5*time.Second {
		t.Errorf("expected 5s default, got %v", d)
	}
}

func TestRetryAfterDuration_InvalidRetryAfter(t *testing.T) {
	t.Parallel()

	d := retryAfterDuration(&rateLimitError{retryAfter: "invalid"})
	if d != 5*time.Second {
		t.Errorf("expected 5s default, got %v", d)
	}
}

func TestRetryAfterDuration_NonRateLimitError(t *testing.T) {
	t.Parallel()

	d := retryAfterDuration(nil)
	if d != 5*time.Second {
		t.Errorf("expected 5s default for non-rate-limit error, got %v", d)
	}
}

func TestClient_Query_WithParams(t *testing.T) {
	t.Parallel()

	var receivedQuery string
	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/test.nsid", func(w http.ResponseWriter, r *http.Request) {
		receivedQuery = r.URL.RawQuery
		writeJSON(w, map[string]string{"ok": "true"})
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	var dst map[string]string
	err := c.query(context.Background(), "test.nsid", map[string]string{"key": "value"}, &dst)
	if err != nil {
		t.Fatalf("query error: %v", err)
	}

	if receivedQuery == "" {
		t.Error("expected query string to be non-empty")
	}
}

func TestClient_Procedure_TokenOverride(t *testing.T) {
	t.Parallel()

	var receivedAuth string
	mux := http.NewServeMux()
	mux.HandleFunc("/xrpc/test.proc", func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		writeJSON(w, map[string]string{"ok": "true"})
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	srvURL, _ := url.Parse(srv.URL)
	c := newClient("default-token")
	c.http = &http.Client{
		Transport: &redirectTransport{scheme: srvURL.Scheme, host: srvURL.Host},
	}

	err := c.procedure(context.Background(), "test.proc", nil, "override-token", nil)
	if err != nil {
		t.Fatalf("procedure error: %v", err)
	}

	if receivedAuth != "Bearer override-token" {
		t.Errorf("expected 'Bearer override-token', got %q", receivedAuth)
	}
}
