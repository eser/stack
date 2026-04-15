// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Post entity — core domain object representing a social media post.
 * Platform-agnostic: used for Twitter/X tweets, Bluesky skeets, and any
 * future platform. Pure data shape; no framework dependencies.
 */

import type { Handle } from "../values/handle.ts";
import type { Platform } from "../values/platform.ts";
import type { PostId } from "../values/post-id.ts";

/** A post as understood by the domain. */
export interface Post {
  /** Platform-assigned identifier (Twitter numeric ID or Bluesky AT-URI). */
  id: PostId;
  /** Full text content of the post. */
  text: string;
  /** Handle of the account that authored the post. */
  authorHandle: Handle;
  /** When the post was published on the platform. */
  createdAt: Date;
  /** Which platform this post came from. */
  platform: Platform;
  /** When the post is scheduled to be sent; undefined for immediate posts. */
  scheduledAt?: Date;
  /** ID of the post this is replying to; present only on reply posts. */
  inReplyToId?: PostId;
  /** Platform conversation ID — groups all posts in a thread under one root. */
  conversationId?: PostId;
  /** Posts referenced by this post (replies, quotes, reposts). */
  referencedPosts?: ReadonlyArray<{
    type: "replied_to" | "quoted" | "reposted";
    id: PostId;
  }>;
  /**
   * Platform-specific opaque references needed for adapter operations.
   * Twitter: not used (only the numeric id is needed for replies).
   * Bluesky: { uri: "at://did:plc:.../app.bsky.feed.post/...", cid: "..." }
   *          — required to construct the reply.root / reply.parent fields.
   */
  platformRef?: Record<string, string>;
}
