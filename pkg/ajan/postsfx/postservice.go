// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx

import (
	"context"
	"fmt"
)

// DefaultPostService implements PostService using a registry of SocialApi adapters.
type DefaultPostService struct {
	reg *registry
}

// NewPostService creates a PostService backed by the given adapter registry.
func NewPostService(reg *registry) *DefaultPostService {
	return &DefaultPostService{reg: reg}
}

// ComposePost publishes a post to the specified platform (or first registered if nil).
func (s *DefaultPostService) ComposePost(ctx context.Context, opts ComposeOptions) (*Post, error) {
	api, err := s.resolveOne(opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.CreatePost(ctx, opts.Text)
}

// ComposePostToAll publishes to every registered platform.
func (s *DefaultPostService) ComposePostToAll(ctx context.Context, text string) ([]PostResult, error) {
	platforms := s.reg.Platforms()
	results := make([]PostResult, 0, len(platforms))

	for _, platform := range platforms {
		api, _ := s.reg.Get(platform)
		post, err := api.CreatePost(ctx, text)
		results = append(results, PostResult{Platform: platform, Post: post, Err: err})
	}

	return results, nil
}

// SchedulePost is a stub — scheduling requires persistence not yet implemented.
func (s *DefaultPostService) SchedulePost(_ context.Context, _ ScheduleOptions) error {
	return fmt.Errorf("SchedulePost: %w", ErrScheduleNotImpl)
}

// GetUnifiedTimeline merges timelines from all registered platforms.
func (s *DefaultPostService) GetUnifiedTimeline(ctx context.Context, maxResultsPerPlatform int) ([]*Post, error) {
	var all []*Post

	for _, platform := range s.reg.Platforms() {
		api, _ := s.reg.Get(platform)

		posts, err := api.GetTimeline(ctx, GetTimelineOptions{
			Platform:   platform,
			MaxResults: maxResultsPerPlatform,
		})
		if err != nil {
			continue // best-effort; skip failing platforms
		}

		all = append(all, posts...)
	}

	return all, nil
}

// GetTimeline fetches the timeline from a single platform.
func (s *DefaultPostService) GetTimeline(ctx context.Context, opts GetTimelineOptions) ([]*Post, error) {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.GetTimeline(ctx, opts)
}

// GetPost fetches a single post.
func (s *DefaultPostService) GetPost(ctx context.Context, id PostID, platform Platform) (*Post, error) {
	api, err := s.resolveOne(&platform)
	if err != nil {
		return nil, err
	}

	return api.GetPost(ctx, id)
}

// ReplyToPost publishes a reply.
func (s *DefaultPostService) ReplyToPost(ctx context.Context, opts ReplyOptions) (*Post, error) {
	if opts.InReplyToPost == nil {
		return nil, fmt.Errorf("ReplyToPost: %w", ErrReplyTargetRequired)
	}

	api, err := s.resolveOne(&opts.InReplyToPost.Platform)
	if err != nil {
		return nil, err
	}

	return api.ReplyToPost(ctx, opts)
}

// PostThread publishes a thread.
func (s *DefaultPostService) PostThread(ctx context.Context, opts ThreadOptions) ([]*Post, error) {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.PostThread(ctx, opts)
}

// GetUsage returns usage data for a single platform.
func (s *DefaultPostService) GetUsage(ctx context.Context, platform Platform) (*UsageData, error) {
	api, err := s.resolveOne(&platform)
	if err != nil {
		return nil, err
	}

	return api.GetUsage(ctx)
}

// Repost reposts.
func (s *DefaultPostService) Repost(ctx context.Context, opts RepostOptions) error {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return err
	}

	return api.Repost(ctx, opts)
}

// UndoRepost undoes a repost.
func (s *DefaultPostService) UndoRepost(ctx context.Context, opts RepostOptions) error {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return err
	}

	return api.UndoRepost(ctx, opts)
}

// QuotePost creates a quote post.
func (s *DefaultPostService) QuotePost(ctx context.Context, opts QuotePostOptions) (*Post, error) {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.QuotePost(ctx, opts)
}

// SearchPosts searches posts on a single platform.
func (s *DefaultPostService) SearchPosts(ctx context.Context, opts SearchOptions) ([]*Post, error) {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.SearchPosts(ctx, opts)
}

// SearchPostsAll searches across all registered platforms.
func (s *DefaultPostService) SearchPostsAll(ctx context.Context, query string, maxResultsPerPlatform int) ([]PostResult, error) {
	var results []PostResult

	for _, platform := range s.reg.Platforms() {
		api, _ := s.reg.Get(platform)

		posts, err := api.SearchPosts(ctx, SearchOptions{
			Query:      query,
			Platform:   platform,
			MaxResults: maxResultsPerPlatform,
		})

		for _, p := range posts {
			results = append(results, PostResult{Platform: platform, Post: p})
		}

		if err != nil {
			results = append(results, PostResult{Platform: platform, Err: err})
		}
	}

	return results, nil
}

// BookmarkPost bookmarks a post.
func (s *DefaultPostService) BookmarkPost(ctx context.Context, opts BookmarkOptions) error {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return err
	}

	return api.BookmarkPost(ctx, opts)
}

// RemoveBookmark removes a bookmark.
func (s *DefaultPostService) RemoveBookmark(ctx context.Context, opts BookmarkOptions) error {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return err
	}

	return api.RemoveBookmark(ctx, opts)
}

// GetBookmarks lists bookmarks.
func (s *DefaultPostService) GetBookmarks(ctx context.Context, opts GetBookmarksOptions) ([]*Post, error) {
	api, err := s.resolveOne(&opts.Platform)
	if err != nil {
		return nil, err
	}

	return api.GetBookmarks(ctx, opts)
}

// resolveOne returns the adapter for the given platform.
// If platform is nil or unknown, returns the first registered adapter.
func (s *DefaultPostService) resolveOne(platform *Platform) (SocialApi, error) {
	if platform != nil && *platform != PlatformUnknown && *platform != "" {
		api, ok := s.reg.Get(*platform)
		if !ok {
			return nil, fmt.Errorf("resolveOne %q: %w", *platform, ErrAdapterNotRegistered)
		}

		if api == nil {
			return nil, fmt.Errorf("resolveOne %q: %w", *platform, ErrNilAdapter)
		}

		return api, nil
	}

	platforms := s.reg.Platforms()
	if len(platforms) == 0 {
		return nil, fmt.Errorf("resolveOne: %w", ErrNoAdaptersRegistered)
	}

	api, _ := s.reg.Get(platforms[0])

	if api == nil {
		return nil, fmt.Errorf("resolveOne: %w", ErrNilAdapter)
	}

	return api, nil
}
