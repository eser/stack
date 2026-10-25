// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Field names follow the snake_case X API v2 JSON wire format.

/**
 * Raw X API v2 JSON response shapes.
 * These are the anti-corruption boundary: never let these types cross into
 * the domain or application layers. Transform via mappers.ts first.
 */

/** A tweet object as returned by X API v2. */
export interface TwitterApiTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{ type: string; id: string }>;
}

/** A user object as returned by X API v2. */
export interface TwitterApiUser {
  id: string;
  name: string;
  username: string;
  /**
   * X subscription level: "Premium", "PremiumPlus", "Business", or absent/other → free.
   * Only present when requested via `user.fields=subscription_type`.
   */
  subscription_type?: string;
}

/** Single-object data envelope (POST /2/tweets, GET /2/users/me, etc.). */
export interface TwitterApiSingleResponse<T> {
  data: T;
  /** Expanded related objects (users, etc.) when expansions are requested. */
  includes?: {
    users?: TwitterApiUser[];
  };
}

/** Collection envelope with optional expansions and pagination metadata. */
export interface TwitterApiListResponse<T> {
  data?: T[];
  includes?: {
    users?: TwitterApiUser[];
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

/** OAuth 2.0 token endpoint response. */
export interface TwitterApiOAuthToken {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

/** POST /2/users/:id/retweets request body. */
export interface TwitterApiRetweetRequest {
  tweet_id: string;
}

/** POST /2/users/:id/retweets response envelope. */
export interface TwitterApiRetweetResponse {
  data: {
    retweeted: boolean;
  };
}

/** Error envelope returned by X API v2 on non-2xx responses. */
export interface TwitterApiError {
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
}

/** A single usage_type entry within a daily usage period. */
export interface TwitterApiUsageType {
  usage_type: string;
  cap?: number;
  count: number;
}

/** Usage for a single day as returned by GET /2/usage/tweets. */
export interface TwitterApiDailyUsage {
  start: string;
  end: string;
  user_count?: number;
  usage_types?: TwitterApiUsageType[];
}

/** Per-app usage entry within the API response. */
export interface TwitterApiAppUsage {
  app_id?: string;
  app_name?: string;
  usage?: TwitterApiDailyUsage[];
}

/** Response envelope for GET /2/usage/tweets. */
export interface TwitterApiUsageResponse {
  data?: {
    daily_client_app_usage?: TwitterApiAppUsage[];
  };
}

/** Response envelope for GET /2/tweets/search/recent (same as list response). */
export interface TwitterApiSearchResponse {
  data?: TwitterApiTweet[];
  includes?: {
    users?: TwitterApiUser[];
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

/** Request body for POST /2/users/:id/bookmarks. */
export interface TwitterApiBookmarkRequest {
  tweet_id: string;
}

/** Response from GET /2/users/:id/bookmarks — uses the standard list + includes envelope. */
export interface TwitterApiBookmarksResponse {
  data?: TwitterApiTweet[];
  includes?: {
    users?: TwitterApiUser[];
  };
  meta?: {
    result_count?: number;
    next_token?: string;
  };
}
