// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Raw X API v2 JSON response shapes.
 * These are the anti-corruption boundary: never let these types cross into
 * the domain or application layers. Transform via mappers.ts first.
 */

/** A tweet object as returned by X API v2. */
export interface TwitterApiTweet {
  id: string;
  text: string;
  // deno-lint-ignore camelcase
  author_id?: string;
  // deno-lint-ignore camelcase
  created_at?: string;
  // deno-lint-ignore camelcase
  conversation_id?: string;
  // deno-lint-ignore camelcase
  in_reply_to_user_id?: string;
  // deno-lint-ignore camelcase
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
  // deno-lint-ignore camelcase
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
    // deno-lint-ignore camelcase
    newest_id?: string;
    // deno-lint-ignore camelcase
    oldest_id?: string;
    // deno-lint-ignore camelcase
    result_count?: number;
    // deno-lint-ignore camelcase
    next_token?: string;
  };
}

/** OAuth 2.0 token endpoint response. */
export interface TwitterApiOAuthToken {
  // deno-lint-ignore camelcase
  access_token: string;
  // deno-lint-ignore camelcase
  refresh_token?: string;
  // deno-lint-ignore camelcase
  token_type: string;
  // deno-lint-ignore camelcase
  expires_in?: number;
  scope?: string;
}

/** POST /2/users/:id/retweets request body. */
export interface TwitterApiRetweetRequest {
  // deno-lint-ignore camelcase
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
  // deno-lint-ignore camelcase
  usage_type: string;
  cap?: number;
  count: number;
}

/** Usage for a single day as returned by GET /2/usage/tweets. */
export interface TwitterApiDailyUsage {
  start: string;
  end: string;
  // deno-lint-ignore camelcase
  user_count?: number;
  // deno-lint-ignore camelcase
  usage_types?: TwitterApiUsageType[];
}

/** Per-app usage entry within the API response. */
export interface TwitterApiAppUsage {
  // deno-lint-ignore camelcase
  app_id?: string;
  // deno-lint-ignore camelcase
  app_name?: string;
  usage?: TwitterApiDailyUsage[];
}

/** Response envelope for GET /2/usage/tweets. */
export interface TwitterApiUsageResponse {
  data?: {
    // deno-lint-ignore camelcase
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
    // deno-lint-ignore camelcase
    newest_id?: string;
    // deno-lint-ignore camelcase
    oldest_id?: string;
    // deno-lint-ignore camelcase
    result_count?: number;
    // deno-lint-ignore camelcase
    next_token?: string;
  };
}

/** Request body for POST /2/users/:id/bookmarks. */
export interface TwitterApiBookmarkRequest {
  // deno-lint-ignore camelcase
  tweet_id: string;
}

/** Response from GET /2/users/:id/bookmarks — uses the standard list + includes envelope. */
export interface TwitterApiBookmarksResponse {
  data?: TwitterApiTweet[];
  includes?: {
    users?: TwitterApiUser[];
  };
  meta?: {
    // deno-lint-ignore camelcase
    result_count?: number;
    // deno-lint-ignore camelcase
    next_token?: string;
  };
}
