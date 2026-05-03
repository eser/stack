// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"context"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// Adapter implements postsfx.SocialApi for Twitter (X) API v2.
type Adapter struct {
	client   *client
	cachedMe *postsfx.User
	cacheMu  sync.Mutex
}

// NewAdapter creates a new Twitter SocialApi adapter.
func NewAdapter(accessToken string) *Adapter {
	return &Adapter{client: newClient(accessToken)}
}

// GetMe returns the authenticated user, caching the result.
func (a *Adapter) GetMe(ctx context.Context) (*postsfx.User, error) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	if a.cachedMe != nil {
		return a.cachedMe, nil
	}

	path := "/users/me?user.fields=" + url.QueryEscape(userFields)
	var resp apiSingleResponse[apiUser]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("GetMe: %w", err)
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("GetMe: %w", ErrEmptyResponse)
	}

	a.cachedMe = mapUser(resp.Data)

	return a.cachedMe, nil
}

// CreatePost publishes a new tweet.
func (a *Adapter) CreatePost(ctx context.Context, text string) (*postsfx.Post, error) {
	body := apiCreateTweetRequest{Text: text}
	var resp apiSingleResponse[apiTweet]

	if err := a.client.post(ctx, "/tweets", body, &resp); err != nil {
		return nil, fmt.Errorf("CreatePost: %w", err)
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("CreatePost: %w", ErrEmptyResponse)
	}

	return mapPost(resp.Data, nil), nil
}

// DeletePost deletes a tweet by ID.
func (a *Adapter) DeletePost(ctx context.Context, id postsfx.PostID) error {
	if err := a.client.delete(ctx, "/tweets/"+string(id)); err != nil {
		return fmt.Errorf("DeletePost: %w", err)
	}

	return nil
}

// GetTimeline fetches tweets from the authenticated user's timeline.
func (a *Adapter) GetTimeline(ctx context.Context, opts postsfx.GetTimelineOptions) ([]*postsfx.Post, error) {
	me, err := a.GetMe(ctx)
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("tweet.fields", tweetFields)
	params.Set("expansions", "author_id")
	params.Set("user.fields", userFields)

	if opts.MaxResults > 0 {
		params.Set("max_results", fmt.Sprint(opts.MaxResults))
	}

	path := fmt.Sprintf("/users/%s/tweets?%s", me.ID, params.Encode())
	var resp apiListResponse[apiTweet]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("GetTimeline: %w", err)
	}

	userIndex := map[string]*apiUser{}
	if resp.Includes != nil {
		userIndex = buildUserIndex(resp.Includes.Users)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Data))
	for i := range resp.Data {
		posts = append(posts, mapPost(&resp.Data[i], userIndex))
	}

	return posts, nil
}

// GetPost fetches a single tweet by ID.
func (a *Adapter) GetPost(ctx context.Context, id postsfx.PostID) (*postsfx.Post, error) {
	params := url.Values{}
	params.Set("tweet.fields", tweetFields)
	params.Set("expansions", "author_id")
	params.Set("user.fields", userFields)

	path := fmt.Sprintf("/tweets/%s?%s", string(id), params.Encode())
	var resp apiSingleResponse[apiTweet]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("GetPost: %w", err)
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("GetPost %q: %w", id, ErrNotFound)
	}

	userIndex := map[string]*apiUser{}
	if resp.Includes != nil {
		userIndex = buildUserIndex(resp.Includes.Users)
	}

	return mapPost(resp.Data, userIndex), nil
}

// ReplyToPost publishes a reply to the given post.
func (a *Adapter) ReplyToPost(ctx context.Context, opts postsfx.ReplyOptions) (*postsfx.Post, error) {
	if opts.InReplyToPost == nil {
		return nil, fmt.Errorf("ReplyToPost: %w", ErrReplyTargetRequired)
	}

	body := apiCreateTweetRequest{
		Text: opts.Text,
		Reply: &apiReplyParams{
			InReplyToTweetID: string(opts.InReplyToPost.ID),
		},
	}

	var resp apiSingleResponse[apiTweet]
	if err := a.client.post(ctx, "/tweets", body, &resp); err != nil {
		return nil, fmt.Errorf("ReplyToPost: %w", err)
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("ReplyToPost: %w", ErrEmptyResponse)
	}

	return mapPost(resp.Data, nil), nil
}

// PostThread publishes a sequence of tweets as a thread.
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

	prev := first
	for i, text := range opts.Texts[1:] {
		reply, err := a.ReplyToPost(ctx, postsfx.ReplyOptions{
			Text:          text,
			InReplyToPost: prev,
		})
		if err != nil {
			return posts, fmt.Errorf("PostThread[%d]: %w", i+1, err)
		}

		posts = append(posts, reply)
		prev = reply
	}

	return posts, nil
}

// GetConversation fetches all tweets in a conversation by searching conversation_id.
func (a *Adapter) GetConversation(ctx context.Context, id postsfx.PostID) ([]*postsfx.Post, error) {
	params := url.Values{}
	params.Set("query", "conversation_id:"+string(id))
	params.Set("tweet.fields", tweetFields)
	params.Set("expansions", "author_id")
	params.Set("user.fields", userFields)

	path := "/tweets/search/recent?" + params.Encode()
	var resp apiListResponse[apiTweet]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("GetConversation: %w", err)
	}

	userIndex := map[string]*apiUser{}
	if resp.Includes != nil {
		userIndex = buildUserIndex(resp.Includes.Users)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Data))
	for i := range resp.Data {
		posts = append(posts, mapPost(&resp.Data[i], userIndex))
	}

	return posts, nil
}

// GetUsage returns tweet API usage data.
func (a *Adapter) GetUsage(ctx context.Context) (*postsfx.UsageData, error) {
	var resp apiUsageResponse
	if err := a.client.get(ctx, "/usage/tweets", &resp); err != nil {
		return nil, fmt.Errorf("GetUsage: %w", err)
	}

	usage := &postsfx.UsageData{}
	if resp.Data != nil {
		usage.AppName = resp.Data.AppID
		for _, day := range resp.Data.DailyProjectUsage {
			count := 0
			for _, entry := range day.UsageData {
				for _, result := range entry.UsageResult {
					count += result.CallCount
				}
			}
			usage.Daily = append(usage.Daily, postsfx.DailyUsage{
				Date:      parseDate(day.Date),
				CallCount: count,
			})
			usage.TotalCalls += count
		}
	}

	return usage, nil
}

// Repost retweets a tweet.
func (a *Adapter) Repost(ctx context.Context, opts postsfx.RepostOptions) error {
	me, err := a.GetMe(ctx)
	if err != nil {
		return err
	}

	body := apiRetweetRequest{TweetID: string(opts.ID)}

	var resp any
	if err := a.client.post(ctx, fmt.Sprintf("/users/%s/retweets", me.ID), body, &resp); err != nil {
		return fmt.Errorf("Repost: %w", err)
	}

	return nil
}

// UndoRepost removes a retweet.
func (a *Adapter) UndoRepost(ctx context.Context, opts postsfx.RepostOptions) error {
	me, err := a.GetMe(ctx)
	if err != nil {
		return err
	}

	if err := a.client.delete(ctx, fmt.Sprintf("/users/%s/retweets/%s", me.ID, string(opts.ID))); err != nil {
		return fmt.Errorf("UndoRepost: %w", err)
	}

	return nil
}

// QuotePost creates a quote tweet.
func (a *Adapter) QuotePost(ctx context.Context, opts postsfx.QuotePostOptions) (*postsfx.Post, error) {
	body := apiCreateTweetRequest{
		Text:         opts.Text,
		QuoteTweetID: string(opts.QuotedPostID),
	}

	var resp apiSingleResponse[apiTweet]
	if err := a.client.post(ctx, "/tweets", body, &resp); err != nil {
		return nil, fmt.Errorf("QuotePost: %w", err)
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("QuotePost: %w", ErrEmptyResponse)
	}

	return mapPost(resp.Data, nil), nil
}

// SearchPosts searches recent tweets.
func (a *Adapter) SearchPosts(ctx context.Context, opts postsfx.SearchOptions) ([]*postsfx.Post, error) {
	params := url.Values{}
	params.Set("query", opts.Query)
	params.Set("tweet.fields", tweetFields)
	params.Set("expansions", "author_id")
	params.Set("user.fields", userFields)

	if opts.MaxResults > 0 {
		params.Set("max_results", fmt.Sprint(opts.MaxResults))
	}

	path := "/tweets/search/recent?" + params.Encode()
	var resp apiListResponse[apiTweet]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("SearchPosts: %w", err)
	}

	userIndex := map[string]*apiUser{}
	if resp.Includes != nil {
		userIndex = buildUserIndex(resp.Includes.Users)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Data))
	for i := range resp.Data {
		posts = append(posts, mapPost(&resp.Data[i], userIndex))
	}

	return posts, nil
}

// BookmarkPost bookmarks a tweet.
func (a *Adapter) BookmarkPost(ctx context.Context, opts postsfx.BookmarkOptions) error {
	me, err := a.GetMe(ctx)
	if err != nil {
		return err
	}

	body := apiBookmarkRequest{TweetID: string(opts.ID)}

	var resp any
	if err := a.client.post(ctx, fmt.Sprintf("/users/%s/bookmarks", me.ID), body, &resp); err != nil {
		return fmt.Errorf("BookmarkPost: %w", err)
	}

	return nil
}

// RemoveBookmark removes a bookmark.
func (a *Adapter) RemoveBookmark(ctx context.Context, opts postsfx.BookmarkOptions) error {
	me, err := a.GetMe(ctx)
	if err != nil {
		return err
	}

	if err := a.client.delete(ctx, fmt.Sprintf("/users/%s/bookmarks/%s", me.ID, string(opts.ID))); err != nil {
		return fmt.Errorf("RemoveBookmark: %w", err)
	}

	return nil
}

// GetBookmarks lists bookmarked tweets.
func (a *Adapter) GetBookmarks(ctx context.Context, opts postsfx.GetBookmarksOptions) ([]*postsfx.Post, error) {
	me, err := a.GetMe(ctx)
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("tweet.fields", tweetFields)
	params.Set("expansions", "author_id")
	params.Set("user.fields", userFields)

	if opts.MaxResults > 0 {
		params.Set("max_results", fmt.Sprint(opts.MaxResults))
	}

	path := fmt.Sprintf("/users/%s/bookmarks?%s", me.ID, params.Encode())
	var resp apiListResponse[apiTweet]

	if err := a.client.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("GetBookmarks: %w", err)
	}

	userIndex := map[string]*apiUser{}
	if resp.Includes != nil {
		userIndex = buildUserIndex(resp.Includes.Users)
	}

	posts := make([]*postsfx.Post, 0, len(resp.Data))
	for i := range resp.Data {
		posts = append(posts, mapPost(&resp.Data[i], userIndex))
	}

	return posts, nil
}

// parseDate is a best-effort YYYY-MM-DD → time.Time parser.
func parseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}
