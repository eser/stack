// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package twitter provides a Twitter API v2 adapter for postsfx.
package twitter

// Wire types for the Twitter API v2.

type apiUser struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Username         string `json:"username"`
	SubscriptionType string `json:"subscription_type,omitempty"`
}

type apiTweet struct {
	ID               string               `json:"id"`
	Text             string               `json:"text"`
	AuthorID         string               `json:"author_id,omitempty"`
	CreatedAt        string               `json:"created_at,omitempty"`
	ConversationID   string               `json:"conversation_id,omitempty"`
	ReferencedTweets []apiReferencedTweet `json:"referenced_tweets,omitempty"`
}

type apiReferencedTweet struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type apiIncludes struct {
	Users []apiUser `json:"users,omitempty"`
}

type apiMeta struct {
	NextToken   string `json:"next_token,omitempty"`
	ResultCount int    `json:"result_count,omitempty"`
}

type apiSingleResponse[T any] struct {
	Data     *T           `json:"data"`
	Includes *apiIncludes `json:"includes,omitempty"`
}

type apiListResponse[T any] struct {
	Data     []T          `json:"data,omitempty"`
	Includes *apiIncludes `json:"includes,omitempty"`
	Meta     *apiMeta     `json:"meta,omitempty"`
}

type apiCreateTweetRequest struct {
	Text         string          `json:"text"`
	Reply        *apiReplyParams `json:"reply,omitempty"`
	QuoteTweetID string          `json:"quote_tweet_id,omitempty"`
}

type apiReplyParams struct {
	InReplyToTweetID string `json:"in_reply_to_tweet_id"`
}

type apiRetweetRequest struct {
	TweetID string `json:"tweet_id"`
}

type apiBookmarkRequest struct {
	TweetID string `json:"tweet_id"`
}

type apiTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

type apiUsageResponse struct {
	Data *apiUsageData `json:"data,omitempty"`
}

type apiUsageData struct {
	AppID             string          `json:"app_id,omitempty"`
	DailyProjectUsage []apiDailyUsage `json:"daily_project_usage,omitempty"`
}

type apiDailyUsage struct {
	Date      string          `json:"date"`
	UsageData []apiUsageEntry `json:"usage"`
}

type apiUsageEntry struct {
	AppID       string           `json:"app_id"`
	UsageResult []apiUsageResult `json:"usage_result"`
}

type apiUsageResult struct {
	CallCount int `json:"call_count"`
}

// tweetFields lists the tweet fields requested in every query.
const tweetFields = "author_id,created_at,conversation_id,referenced_tweets"

// userFields lists the user fields requested in every query.
const userFields = "id,name,username,subscription_type"
