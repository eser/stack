// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// Adapter implements postsfx.SocialApi for the Bluesky AT Protocol.
type Adapter struct {
	client   *client
	did      string // authenticated user's DID
	cachedMe *postsfx.User
	cacheMu  sync.Mutex
}

// NewAdapter creates a new Bluesky SocialApi adapter.
// accessJwt and did come from a prior login or SetTokens call.
func NewAdapter(accessJwt, did string) *Adapter {
	return &Adapter{
		client: newClient(accessJwt),
		did:    did,
	}
}

// GetMe returns the authenticated user's profile, caching the result.
func (a *Adapter) GetMe(ctx context.Context) (*postsfx.User, error) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	if a.cachedMe != nil {
		return a.cachedMe, nil
	}

	if a.did == "" {
		return nil, fmt.Errorf("GetMe: %w", ErrDIDRequired)
	}

	var profile apiProfile
	if err := a.client.query(ctx, "app.bsky.actor.getProfile", map[string]string{
		"actor": a.did,
	}, &profile); err != nil {
		return nil, fmt.Errorf("GetMe: %w", err)
	}

	a.cachedMe = mapUser(&profile)

	return a.cachedMe, nil
}

// CreatePost publishes a new Bluesky post (app.bsky.feed.post record).
func (a *Adapter) CreatePost(ctx context.Context, text string) (*postsfx.Post, error) {
	ref, err := a.createPostRecord(ctx, text, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("CreatePost: %w", err)
	}

	return &postsfx.Post{
		ID:          postsfx.PostID(ref.URI),
		Text:        text,
		Platform:    postsfx.PlatformBluesky,
		CreatedAt:   time.Now().UTC(),
		PlatformRef: map[string]string{"uri": ref.URI, "cid": ref.CID},
	}, nil
}

// DeletePost deletes a Bluesky post by AT URI.
func (a *Adapter) DeletePost(ctx context.Context, id postsfx.PostID) error {
	rkey := rkeyFromURI(string(id))
	if rkey == "" {
		return fmt.Errorf("DeletePost %q: %w", id, ErrRkeyExtractFailed)
	}

	if err := a.client.procedure(ctx, "com.atproto.repo.deleteRecord", apiDeleteRecordRequest{
		Repo:       a.did,
		Collection: lexiconPost,
		RKey:       rkey,
	}, "", nil); err != nil {
		return fmt.Errorf("DeletePost: %w", err)
	}

	return nil
}

// GetTimeline fetches the authenticated user's home timeline.
func (a *Adapter) GetTimeline(ctx context.Context, opts postsfx.GetTimelineOptions) ([]*postsfx.Post, error) {
	params := map[string]string{}
	if opts.MaxResults > 0 {
		params["limit"] = fmt.Sprint(opts.MaxResults)
	}

	var resp apiGetTimelineResponse
	if err := a.client.query(ctx, "app.bsky.feed.getTimeline", params, &resp); err != nil {
		return nil, fmt.Errorf("GetTimeline: %w", err)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Feed))
	for _, item := range resp.Feed {
		posts = append(posts, mapPost(&item.Post))
	}

	return posts, nil
}

// GetPost fetches a single post by AT URI.
func (a *Adapter) GetPost(ctx context.Context, id postsfx.PostID) (*postsfx.Post, error) {
	var resp apiGetPostsResponse
	if err := a.client.query(ctx, "app.bsky.feed.getPosts", map[string]string{
		"uris": string(id),
	}, &resp); err != nil {
		return nil, fmt.Errorf("GetPost: %w", err)
	}

	if len(resp.Posts) == 0 {
		return nil, fmt.Errorf("GetPost %q: %w", id, ErrPostNotFound)
	}

	return mapPost(&resp.Posts[0]), nil
}

// ReplyToPost publishes a reply, threading root and parent refs correctly.
func (a *Adapter) ReplyToPost(ctx context.Context, opts postsfx.ReplyOptions) (*postsfx.Post, error) {
	if opts.InReplyToPost == nil {
		return nil, fmt.Errorf("ReplyToPost: %w", ErrReplyTargetRequired)
	}

	parent := opts.InReplyToPost
	parentRef := apiRef{
		URI: string(parent.ID),
		CID: parent.PlatformRef["cid"],
	}

	// For a single-level reply treat root == parent.
	// If the parent has a ConversationID we could look up the root, but
	// tracking it explicitly is the caller's responsibility.
	rootRef := parentRef

	replyRef := &apiReplyRef{Root: rootRef, Parent: parentRef}

	ref, err := a.createPostRecord(ctx, opts.Text, replyRef, nil)
	if err != nil {
		return nil, fmt.Errorf("ReplyToPost: %w", err)
	}

	replyToID := parent.ID

	return &postsfx.Post{
		ID:          postsfx.PostID(ref.URI),
		Text:        opts.Text,
		Platform:    postsfx.PlatformBluesky,
		CreatedAt:   time.Now().UTC(),
		InReplyToID: &replyToID,
		PlatformRef: map[string]string{"uri": ref.URI, "cid": ref.CID},
	}, nil
}

// PostThread publishes a sequence of posts as a connected thread.
func (a *Adapter) PostThread(ctx context.Context, opts postsfx.ThreadOptions) ([]*postsfx.Post, error) {
	if len(opts.Texts) == 0 {
		return nil, fmt.Errorf("PostThread: %w", ErrEmptyTexts)
	}

	posts := make([]*postsfx.Post, 0, len(opts.Texts))

	first, err := a.CreatePost(ctx, opts.Texts[0])
	if err != nil {
		return posts, fmt.Errorf("PostThread[0]: %w", err)
	}

	posts = append(posts, first)

	// Track root ref for proper threading.
	rootRef := apiRef{URI: string(first.ID), CID: first.PlatformRef["cid"]}
	parentRef := rootRef

	for i, text := range opts.Texts[1:] {
		replyRef := &apiReplyRef{Root: rootRef, Parent: parentRef}

		ref, err := a.createPostRecord(ctx, text, replyRef, nil)
		if err != nil {
			return posts, fmt.Errorf("PostThread[%d]: %w", i+1, err)
		}

		replyTo := first.ID
		post := &postsfx.Post{
			ID:          postsfx.PostID(ref.URI),
			Text:        text,
			Platform:    postsfx.PlatformBluesky,
			CreatedAt:   time.Now().UTC(),
			InReplyToID: &replyTo,
			PlatformRef: map[string]string{"uri": ref.URI, "cid": ref.CID},
		}
		posts = append(posts, post)

		parentRef = apiRef{URI: ref.URI, CID: ref.CID}
	}

	return posts, nil
}

// GetConversation fetches a thread and flattens it into a post slice.
func (a *Adapter) GetConversation(ctx context.Context, id postsfx.PostID) ([]*postsfx.Post, error) {
	var resp apiThreadResponse
	if err := a.client.query(ctx, "app.bsky.feed.getPostThread", map[string]string{
		"uri":   string(id),
		"depth": "10",
	}, &resp); err != nil {
		return nil, fmt.Errorf("GetConversation: %w", err)
	}

	return flattenThread(resp.Thread), nil
}

// GetUsage always returns empty data — Bluesky has no billing API.
func (a *Adapter) GetUsage(_ context.Context) (*postsfx.UsageData, error) {
	return &postsfx.UsageData{}, nil
}

// Repost creates a repost record.
func (a *Adapter) Repost(ctx context.Context, opts postsfx.RepostOptions) error {
	// Fetch the post to get its CID.
	post, err := a.GetPost(ctx, opts.ID)
	if err != nil {
		return fmt.Errorf("Repost: %w", err)
	}

	record := apiRepostRecord{
		Type:      lexiconRepost,
		Subject:   apiRef{URI: string(post.ID), CID: post.PlatformRef["cid"]},
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	if err := a.client.procedure(ctx, "com.atproto.repo.createRecord", apiCreateRecordRequest{
		Repo:       a.did,
		Collection: lexiconRepost,
		Record:     record,
	}, "", nil); err != nil {
		return fmt.Errorf("Repost: %w", err)
	}

	return nil
}

// UndoRepost searches the user's repost records and deletes the matching one.
func (a *Adapter) UndoRepost(ctx context.Context, opts postsfx.RepostOptions) error {
	var resp apiListRecordsResponse
	if err := a.client.query(ctx, "com.atproto.repo.listRecords", map[string]string{
		"repo":       a.did,
		"collection": lexiconRepost,
		"limit":      "100",
	}, &resp); err != nil {
		return fmt.Errorf("UndoRepost list: %w", err)
	}

	for _, rec := range resp.Records {
		if rec.Value.Subject.URI == string(opts.ID) {
			rkey := rkeyFromURI(rec.URI)
			if err := a.client.procedure(ctx, "com.atproto.repo.deleteRecord", apiDeleteRecordRequest{
				Repo:       a.did,
				Collection: lexiconRepost,
				RKey:       rkey,
			}, "", nil); err != nil {
				return fmt.Errorf("UndoRepost delete: %w", err)
			}

			return nil
		}
	}

	return fmt.Errorf("UndoRepost %q: %w", opts.ID, ErrRepostNotFound)
}

// QuotePost creates a post with an embed.record reference.
func (a *Adapter) QuotePost(ctx context.Context, opts postsfx.QuotePostOptions) (*postsfx.Post, error) {
	// Fetch the quoted post to get its CID.
	quoted, err := a.GetPost(ctx, opts.QuotedPostID)
	if err != nil {
		return nil, fmt.Errorf("QuotePost: %w", err)
	}

	embed := apiEmbedRecord{
		Type:   lexiconEmbedRecord,
		Record: apiRef{URI: string(quoted.ID), CID: quoted.PlatformRef["cid"]},
	}

	ref, err := a.createPostRecord(ctx, opts.Text, nil, embed)
	if err != nil {
		return nil, fmt.Errorf("QuotePost: %w", err)
	}

	return &postsfx.Post{
		ID:          postsfx.PostID(ref.URI),
		Text:        opts.Text,
		Platform:    postsfx.PlatformBluesky,
		CreatedAt:   time.Now().UTC(),
		PlatformRef: map[string]string{"uri": ref.URI, "cid": ref.CID},
	}, nil
}

// SearchPosts searches posts on Bluesky.
func (a *Adapter) SearchPosts(ctx context.Context, opts postsfx.SearchOptions) ([]*postsfx.Post, error) {
	params := map[string]string{"q": opts.Query}
	if opts.MaxResults > 0 {
		params["limit"] = fmt.Sprint(opts.MaxResults)
	}

	var resp apiSearchPostsResponse
	if err := a.client.query(ctx, "app.bsky.feed.searchPosts", params, &resp); err != nil {
		return nil, fmt.Errorf("SearchPosts: %w", err)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Posts))
	for i := range resp.Posts {
		posts = append(posts, mapPost(&resp.Posts[i]))
	}

	return posts, nil
}

// BookmarkPost is not supported on Bluesky.
func (a *Adapter) BookmarkPost(_ context.Context, _ postsfx.BookmarkOptions) error {
	return fmt.Errorf("BookmarkPost: %w", ErrBookmarksUnsupported)
}

// RemoveBookmark is not supported on Bluesky.
func (a *Adapter) RemoveBookmark(_ context.Context, _ postsfx.BookmarkOptions) error {
	return fmt.Errorf("RemoveBookmark: %w", ErrBookmarksUnsupported)
}

// GetBookmarks is not supported on Bluesky.
func (a *Adapter) GetBookmarks(_ context.Context, _ postsfx.GetBookmarksOptions) ([]*postsfx.Post, error) {
	return nil, fmt.Errorf("GetBookmarks: %w", ErrBookmarksUnsupported)
}

// --- helpers ---

// createPostRecord is the shared helper for all post creation variants.
func (a *Adapter) createPostRecord(ctx context.Context, text string, reply *apiReplyRef, embed any) (*apiCreateRecordResponse, error) {
	record := apiPostRecord{
		Type:      lexiconPost,
		Text:      text,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Reply:     reply,
		Embed:     embed,
	}

	var resp apiCreateRecordResponse
	if err := a.client.procedure(ctx, "com.atproto.repo.createRecord", apiCreateRecordRequest{
		Repo:       a.did,
		Collection: lexiconPost,
		Record:     record,
	}, "", &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}
