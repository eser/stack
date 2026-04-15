// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * SocialApi — outbound port for social platform operations.
 * Platform-agnostic: both TwitterSocialApi and BlueSkySocialApi implement this.
 */

import * as results from "@eserstack/primitives/results";
import type { Post } from "../domain/entities/post.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { User } from "../domain/entities/user.ts";
import type { PostId } from "../domain/values/post-id.ts";

/** Outbound port: operations against a social platform. */
export interface SocialApi {
  /** Publish a new post and return the platform-assigned id + any platform refs. */
  createPost(
    params: { text: string },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }>;
  /** Delete a post by its platform identifier. */
  deletePost(id: PostId): Promise<void>;
  /** Retrieve the authenticated user's home timeline. */
  getTimeline(params: { maxResults?: number }): Promise<Post[]>;
  /** Retrieve the authenticated user's own profile. */
  getMe(): Promise<User>;
  /** Fetch a single post by ID. */
  getPost(id: PostId): Promise<Post>;
  /**
   * Post a reply to an existing post.
   * The full parent Post is required so Bluesky can extract platformRef (uri + cid).
   */
  replyToPost(
    params: { text: string; inReplyToPost: Post },
  ): Promise<{ id: PostId; platformRef?: Record<string, string> }>;
  /**
   * Post a thread — texts posted sequentially, each replying to the previous.
   * Returns Fail with ThreadPartialError when posting fails partway through.
   */
  postThread(
    params: { texts: ReadonlyArray<string> },
  ): Promise<results.Result<{ posts: Post[] }, Error>>;
  /**
   * Fetch replies to a post using platform-specific search.
   * NOTE: May require elevated API access depending on the platform.
   */
  getConversation(
    params: { postId: PostId; maxResults?: number },
  ): Promise<Post[]>;
  /**
   * Retrieve API usage data for the current billing period.
   * NOTE: Bluesky has no billing API — implementations may return empty data.
   */
  getUsage(): Promise<UsageData>;

  /**
   * Repost (share) another user's post without commentary.
   * Twitter: POST /2/users/:id/retweets
   * Bluesky: createRecord in app.bsky.feed.repost collection
   */
  repost(id: PostId): Promise<void>;

  /**
   * Remove a repost.
   * Takes the original post's ID — the adapter handles the platform-specific lookup.
   * Twitter: DELETE /2/users/:id/retweets/:tweet_id
   * Bluesky: listRecords to find matching repost record, then deleteRecord
   */
  undoRepost(id: PostId): Promise<void>;

  /**
   * Quote post — share another post with your own commentary text.
   * Returns the newly created quote post's ID.
   * Twitter: POST /2/tweets with quote_tweet_id
   * Bluesky: createRecord with app.bsky.embed.record embed
   */
  quotePost(
    params: { text: string; quotedPostId: PostId },
  ): Promise<{ id: PostId }>;

  /**
   * Search for posts matching a query string.
   * Query syntax is platform-specific — callers are responsible for operators.
   * Twitter: GET /2/tweets/search/recent
   * Bluesky: GET /xrpc/app.bsky.feed.searchPosts
   */
  searchPosts(params: { query: string; maxResults?: number }): Promise<Post[]>;

  /**
   * Add a post to the authenticated user's bookmarks.
   * Twitter: POST /2/users/:id/bookmarks
   * Bluesky: not supported — implementations must throw.
   */
  bookmarkPost(id: PostId): Promise<void>;

  /**
   * Remove a post from the authenticated user's bookmarks.
   * Twitter: DELETE /2/users/:id/bookmarks/:tweet_id
   * Bluesky: not supported — implementations must throw.
   */
  removeBookmark(id: PostId): Promise<void>;

  /**
   * List the authenticated user's bookmarked posts.
   * Twitter: GET /2/users/:id/bookmarks
   * Bluesky: not supported — implementations must throw.
   */
  getBookmarks(params?: { maxResults?: number }): Promise<Post[]>;
}
