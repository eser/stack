// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package postsfx provides domain types and service interfaces for cross-platform
// social media post management. Adapters for specific platforms (Twitter, Bluesky)
// are provided separately and implement the SocialApi outbound port.
package postsfx

import "time"

// Platform identifies a supported social media platform.
type Platform string

const (
	PlatformTwitter Platform = "twitter"
	PlatformBluesky Platform = "bluesky"
	PlatformUnknown Platform = "unknown"
)

// PostID is an opaque identifier for a social media post.
// The value is platform-specific (tweet ID, Bluesky rkey, etc.).
type PostID string

// Handle represents a @username on any platform.
type Handle string

// ReferencedPostType classifies the relationship between two posts.
type ReferencedPostType string

const (
	ReferencedPostRepliedTo ReferencedPostType = "replied_to"
	ReferencedPostQuoted    ReferencedPostType = "quoted"
	ReferencedPostReposted  ReferencedPostType = "reposted"
)

// ReferencedPost links a post to another via a typed relationship.
type ReferencedPost struct {
	Type ReferencedPostType
	ID   PostID
}

// Post is the core social media entity. PlatformRef holds platform-specific
// metadata (e.g. Bluesky's uri+cid pair needed for thread construction).
type Post struct {
	ID              PostID
	Text            string
	AuthorHandle    Handle
	Platform        Platform
	CreatedAt       time.Time
	ScheduledAt     *time.Time
	InReplyToID     *PostID
	ConversationID  *PostID
	ReferencedPosts []ReferencedPost
	PlatformRef     map[string]string // e.g. {"uri": "at://...", "cid": "bafyrei..."}
}

// SubscriptionTier classifies a user's subscription level on a given platform.
type SubscriptionTier string

const (
	SubscriptionFree        SubscriptionTier = "free"
	SubscriptionPremium     SubscriptionTier = "premium"
	SubscriptionPremiumPlus SubscriptionTier = "premium_plus"
	SubscriptionBusiness    SubscriptionTier = "business"
)

// OAuthTokens holds the token set for a user's platform authentication.
type OAuthTokens struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    *time.Time
	// PlatformData holds extra platform-specific fields (e.g. Bluesky did/session).
	PlatformData map[string]string
}

// User represents the authenticated account on a platform.
type User struct {
	ID               string
	Handle           Handle
	DisplayName      string
	Platform         Platform
	SubscriptionTier SubscriptionTier
	Tokens           *OAuthTokens
}

// DailyUsage records API call volume for a single calendar day.
type DailyUsage struct {
	Date      time.Time
	CallCount int
}

// UsageData aggregates API usage metrics across a time window.
type UsageData struct {
	AppName    string
	Daily      []DailyUsage
	TotalCalls int
}

// PostResult pairs a platform with its post outcome for multi-platform operations.
type PostResult struct {
	Platform Platform
	Post     *Post
	Err      error
}

// GetTimelineOptions configures a timeline fetch.
type GetTimelineOptions struct {
	Platform   Platform
	MaxResults int
}

// SearchOptions configures a post search query.
type SearchOptions struct {
	Query      string
	Platform   Platform
	MaxResults int
}

// BookmarkOptions identifies a post for bookmark operations.
type BookmarkOptions struct {
	ID       PostID
	Platform Platform
}

// GetBookmarksOptions configures a bookmark listing.
type GetBookmarksOptions struct {
	Platform   Platform
	MaxResults int
}

// RepostOptions identifies a post for repost/undo-repost operations.
type RepostOptions struct {
	ID       PostID
	Platform Platform
}

// QuotePostOptions constructs a quote post.
type QuotePostOptions struct {
	Text         string
	QuotedPostID PostID
	Platform     Platform
}

// ReplyOptions constructs a reply post.
type ReplyOptions struct {
	Text          string
	InReplyToPost *Post
}

// ThreadOptions constructs a thread of connected posts.
type ThreadOptions struct {
	Texts    []string
	Platform Platform
}

// ComposeOptions controls post composition.
type ComposeOptions struct {
	Text     string
	Platform *Platform // nil = post to all configured platforms
}

// ScheduleOptions schedules a post for future publication.
type ScheduleOptions struct {
	Text        string
	ScheduledAt time.Time
	Platform    *Platform
}
