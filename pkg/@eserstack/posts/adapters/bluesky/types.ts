// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Raw AT Protocol / Bluesky API response shapes.
 * Anti-corruption boundary — never let these types escape into the domain.
 * Transform via mappers.ts first.
 */

/** Response from com.atproto.server.createSession or refreshSession. */
export interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

/** A post record stored in the repo. */
export interface BlueskyPostRecord {
  "$type": string;
  text: string;
  createdAt: string;
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
}

/** Author profile embedded in post views. */
export interface BlueskyAuthorProfile {
  did: string;
  handle: string;
  displayName?: string;
}

/** A single post as it appears in a feed or thread view. */
export interface BlueskyPostView {
  uri: string;
  cid: string;
  author: BlueskyAuthorProfile;
  record: BlueskyPostRecord;
  indexedAt: string;
}

/** A feed item — wraps a post view with optional reply/repost context. */
export interface BlueskyFeedViewPost {
  post: BlueskyPostView;
}

/** Response from app.bsky.feed.getTimeline. */
export interface BlueskyTimelineResponse {
  feed: BlueskyFeedViewPost[];
  cursor?: string;
}

/** Response from app.bsky.feed.getPosts. */
export interface BlueskyGetPostsResponse {
  posts: BlueskyPostView[];
}

/** Response from com.atproto.repo.createRecord. */
export interface BlueskyCreateRecordResponse {
  uri: string;
  cid: string;
}

/** Response from app.bsky.actor.getProfile. */
export interface BlueskyProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
}

/** Thread node — may be a post view, a not-found sentinel, or a blocked sentinel. */
export interface BlueskyThreadNode {
  "$type": string;
  post?: BlueskyPostView;
  replies?: BlueskyThreadNode[];
}

/** Response from app.bsky.feed.getPostThread. */
export interface BlueskyThreadResponse {
  thread: BlueskyThreadNode;
}

/** A repost (app.bsky.feed.repost) record stored in the AT repo. */
export interface BlueskyRepostRecord {
  uri: string;
  cid: string;
  value: {
    "$type": "app.bsky.feed.repost";
    subject: { uri: string; cid: string };
    createdAt: string;
  };
}

/** Response from com.atproto.repo.listRecords. */
export interface BlueskyListRecordsResponse<T> {
  records: T[];
  cursor?: string;
}

/** An embed that quotes another post (app.bsky.embed.record). */
export interface BlueskyEmbedRecord {
  "$type": "app.bsky.embed.record";
  record: { uri: string; cid: string };
}

/** Response from app.bsky.feed.searchPosts. */
export interface BlueskySearchPostsResponse {
  posts: BlueskyPostView[];
  cursor?: string;
  hitsTotal?: number;
}

/** Error envelope returned by XRPC endpoints. */
export interface BlueskyApiError {
  error?: string;
  message?: string;
}
