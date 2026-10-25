// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/eser/stack/pkg/ajan/postsfx"
	"github.com/eser/stack/pkg/ajan/postsfx/bluesky"
	"github.com/eser/stack/pkg/ajan/postsfx/twitter"
)

func drainPostsHandles() shutdownStep {
	postsHandleMu.Lock()
	clear(postsHandles)
	postsHandleMu.Unlock()

	return shutdownStep{} //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Posts (social media) bridge
// ---------------------------------------------------------------------------

var (
	postsHandles   = make(map[string]*postsfx.DefaultPostService)
	postsHandleMu  sync.RWMutex
	postsHandleSeq atomic.Int64
)

// postsCreateRequest configures platform adapters for a new PostService.
type postsCreateRequest struct {
	Twitter *postsTwitterConfig `json:"twitter,omitempty"`
	Bluesky *postsBskyConfig    `json:"bluesky,omitempty"`
}

type postsTwitterConfig struct {
	AccessToken string `json:"accessToken"`
}

type postsBskyConfig struct {
	AccessJwt string `json:"accessJwt"`
	DID       string `json:"did"`
}

type postsHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type postsComposeRequest struct {
	Handle   string `json:"handle"`
	Platform string `json:"platform,omitempty"`
	Text     string `json:"text"`
}

type postsPostJSON struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Platform string `json:"platform"`
	Handle   string `json:"authorHandle,omitempty"`
}

type postsPostResponse struct {
	Post  *postsPostJSON   `json:"post,omitempty"`
	Posts []*postsPostJSON `json:"posts,omitempty"`
	Error string           `json:"error,omitempty"`
}

type postsTimelineRequest struct {
	Handle     string `json:"handle"`
	Platform   string `json:"platform,omitempty"`
	MaxResults int    `json:"maxResults,omitempty"`
}

type postsSearchRequest struct {
	Handle     string `json:"handle"`
	Platform   string `json:"platform,omitempty"`
	Query      string `json:"query"`
	MaxResults int    `json:"maxResults,omitempty"`
}

// bridgePostsCreateService creates a PostService from platform credentials and returns a handle.
func bridgePostsCreateService(requestJSON string) string {
	var req postsCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	reg := postsfx.NewRegistry()

	if req.Twitter != nil && req.Twitter.AccessToken != "" {
		reg.Register(postsfx.PlatformTwitter, twitter.NewAdapter(req.Twitter.AccessToken))
	}

	if req.Bluesky != nil && req.Bluesky.AccessJwt != "" {
		reg.Register(postsfx.PlatformBluesky, bluesky.NewAdapter(req.Bluesky.AccessJwt, req.Bluesky.DID))
	}

	if len(reg.Platforms()) == 0 {
		return marshalResponse(postsHandleResponse{Error: "no platform credentials provided"}) //nolint:exhaustruct
	}

	svc := postsfx.NewPostService(reg)
	id := fmt.Sprintf("posts-%d", postsHandleSeq.Add(1))

	postsHandleMu.Lock()
	postsHandles[id] = svc
	postsHandleMu.Unlock()

	return marshalResponse(postsHandleResponse{Handle: id}) //nolint:exhaustruct
}

// bridgePostsCompose publishes a post using an existing service handle.
func bridgePostsCompose(requestJSON string) string {
	var req postsComposeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var platform *postsfx.Platform
	if req.Platform != "" {
		p := postsfx.Platform(req.Platform)
		platform = &p
	}

	post, err := svc.ComposePost(context.Background(), postsfx.ComposeOptions{
		Text:     req.Text,
		Platform: platform,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(postsPostResponse{Post: postToJSON(post)}) //nolint:exhaustruct
}

// bridgePostsGetTimeline fetches the timeline using an existing service handle.
func bridgePostsGetTimeline(requestJSON string) string {
	var req postsTimelineRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	platform := postsfx.Platform(req.Platform)
	posts, err := svc.GetTimeline(context.Background(), postsfx.GetTimelineOptions{
		Platform:   platform,
		MaxResults: req.MaxResults,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonPosts := make([]*postsPostJSON, 0, len(posts))
	for _, p := range posts {
		jsonPosts = append(jsonPosts, postToJSON(p))
	}

	return marshalResponse(postsPostResponse{Posts: jsonPosts}) //nolint:exhaustruct
}

// bridgePostsSearch searches posts using an existing service handle.
func bridgePostsSearch(requestJSON string) string {
	var req postsSearchRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsPostResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	svc, err := getPostsHandle(req.Handle)
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	posts, err := svc.SearchPosts(context.Background(), postsfx.SearchOptions{
		Query:      req.Query,
		Platform:   postsfx.Platform(req.Platform),
		MaxResults: req.MaxResults,
	})
	if err != nil {
		return marshalResponse(postsPostResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonPosts := make([]*postsPostJSON, 0, len(posts))
	for _, p := range posts {
		jsonPosts = append(jsonPosts, postToJSON(p))
	}

	return marshalResponse(postsPostResponse{Posts: jsonPosts}) //nolint:exhaustruct
}

// bridgePostsClose releases a service handle.
func bridgePostsClose(requestJSON string) string {
	var req struct {
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(postsHandleResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	postsHandleMu.Lock()
	delete(postsHandles, req.Handle)
	postsHandleMu.Unlock()

	return marshalResponse(postsHandleResponse{Handle: req.Handle}) //nolint:exhaustruct
}

// --- helpers ---

func getPostsHandle(id string) (*postsfx.DefaultPostService, error) {
	postsHandleMu.RLock()
	svc, ok := postsHandles[id]
	postsHandleMu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("posts handle %q not found", id)
	}

	return svc, nil
}

func postToJSON(p *postsfx.Post) *postsPostJSON {
	if p == nil {
		return nil
	}

	return &postsPostJSON{
		ID:       string(p.ID),
		Text:     p.Text,
		Platform: string(p.Platform),
		Handle:   string(p.AuthorHandle),
	}
}

func init() {
	registerShutdownDrain(drainPostsHandles)
	register("postsCreateService", []string{"requestJSON"}, func(a []string) string { return bridgePostsCreateService(a[0]) })
	register("postsCompose", []string{"requestJSON"}, func(a []string) string { return bridgePostsCompose(a[0]) })
	register("postsGetTimeline", []string{"requestJSON"}, func(a []string) string { return bridgePostsGetTimeline(a[0]) })
	register("postsSearch", []string{"requestJSON"}, func(a []string) string { return bridgePostsSearch(a[0]) })
	register("postsClose", []string{"requestJSON"}, func(a []string) string { return bridgePostsClose(a[0]) })
}
