// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx

import "context"

// SocialApi is the outbound port that platform adapters (Twitter, Bluesky) implement.
// All methods operate on a single platform; multi-platform fanout is the
// responsibility of PostService.
type SocialApi interface {
	CreatePost(ctx context.Context, text string) (*Post, error)
	DeletePost(ctx context.Context, id PostID) error
	GetTimeline(ctx context.Context, opts GetTimelineOptions) ([]*Post, error)
	GetMe(ctx context.Context) (*User, error)
	GetPost(ctx context.Context, id PostID) (*Post, error)
	ReplyToPost(ctx context.Context, opts ReplyOptions) (*Post, error)
	PostThread(ctx context.Context, opts ThreadOptions) ([]*Post, error)
	GetConversation(ctx context.Context, id PostID) ([]*Post, error)
	GetUsage(ctx context.Context) (*UsageData, error)
	Repost(ctx context.Context, opts RepostOptions) error
	UndoRepost(ctx context.Context, opts RepostOptions) error
	QuotePost(ctx context.Context, opts QuotePostOptions) (*Post, error)
	SearchPosts(ctx context.Context, opts SearchOptions) ([]*Post, error)
	BookmarkPost(ctx context.Context, opts BookmarkOptions) error
	RemoveBookmark(ctx context.Context, opts BookmarkOptions) error
	GetBookmarks(ctx context.Context, opts GetBookmarksOptions) ([]*Post, error)
}

// AuthProvider is the outbound port that handles OAuth flows per platform.
type AuthProvider interface {
	RequiresBrowser() bool
	IsAuthenticated(ctx context.Context) (bool, error)
	GetAuthorizationURL(ctx context.Context) (string, error)
	ExchangeCode(ctx context.Context, code, codeVerifier string) (*OAuthTokens, error)
	LoginWithCredentials(ctx context.Context, identifier, password string) (*OAuthTokens, error)
	RefreshToken(ctx context.Context, refreshToken string) (*OAuthTokens, error)
	SetTokens(ctx context.Context, tokens *OAuthTokens) error
	ClearTokens(ctx context.Context) error
}

// TokenStore persists OAuth tokens across process restarts.
type TokenStore interface {
	Load(ctx context.Context, platform Platform) (*OAuthTokens, error)
	Save(ctx context.Context, platform Platform, tokens *OAuthTokens) error
	Clear(ctx context.Context, platform Platform) error
}

// PostService is the inbound application port exposed to callers.
// It orchestrates multi-platform fanout and delegates to SocialApi adapters.
type PostService interface {
	// ComposePost publishes a post to the specified platform (or all if Platform is nil).
	ComposePost(ctx context.Context, opts ComposeOptions) (*Post, error)
	// ComposePostToAll publishes to every registered platform and returns per-platform results.
	ComposePostToAll(ctx context.Context, text string) ([]PostResult, error)
	// SchedulePost records a post for future delivery.
	SchedulePost(ctx context.Context, opts ScheduleOptions) error
	// GetUnifiedTimeline fetches and merges timelines from all registered platforms.
	GetUnifiedTimeline(ctx context.Context, maxResultsPerPlatform int) ([]*Post, error)
	// GetTimeline fetches the timeline from a single platform.
	GetTimeline(ctx context.Context, opts GetTimelineOptions) ([]*Post, error)
	// GetPost fetches a single post by ID and platform.
	GetPost(ctx context.Context, id PostID, platform Platform) (*Post, error)
	// ReplyToPost publishes a reply to the given post on its original platform.
	ReplyToPost(ctx context.Context, opts ReplyOptions) (*Post, error)
	// PostThread publishes a sequence of connected posts.
	PostThread(ctx context.Context, opts ThreadOptions) ([]*Post, error)
	// GetUsage returns API usage data for the given platform (all if Platform=="").
	GetUsage(ctx context.Context, platform Platform) (*UsageData, error)
	// Repost reposts or undoes a repost on the specified platform.
	Repost(ctx context.Context, opts RepostOptions) error
	UndoRepost(ctx context.Context, opts RepostOptions) error
	// QuotePost publishes a quote of an existing post.
	QuotePost(ctx context.Context, opts QuotePostOptions) (*Post, error)
	// SearchPosts searches posts on a single platform.
	SearchPosts(ctx context.Context, opts SearchOptions) ([]*Post, error)
	// SearchPostsAll searches across all registered platforms.
	SearchPostsAll(ctx context.Context, query string, maxResultsPerPlatform int) ([]PostResult, error)
	// BookmarkPost adds or removes a bookmark.
	BookmarkPost(ctx context.Context, opts BookmarkOptions) error
	RemoveBookmark(ctx context.Context, opts BookmarkOptions) error
	// GetBookmarks lists bookmarked posts.
	GetBookmarks(ctx context.Context, opts GetBookmarksOptions) ([]*Post, error)
}

// registry maps platform names to their SocialApi adapters.
type registry struct {
	adapters map[Platform]SocialApi
}

// NewRegistry creates a new adapter registry.
// Callers register one adapter per platform then pass the registry to NewPostService.
func NewRegistry() *registry { //nolint:revive
	return &registry{adapters: make(map[Platform]SocialApi)}
}

// Register adds or replaces the adapter for a platform.
func (r *registry) Register(platform Platform, api SocialApi) {
	r.adapters[platform] = api
}

// Get returns the adapter for a platform.
func (r *registry) Get(platform Platform) (SocialApi, bool) {
	api, ok := r.adapters[platform]
	return api, ok
}

// Platforms returns all registered platforms.
func (r *registry) Platforms() []Platform {
	platforms := make([]Platform, 0, len(r.adapters))
	for p := range r.adapters {
		platforms = append(platforms, p)
	}
	return platforms
}
