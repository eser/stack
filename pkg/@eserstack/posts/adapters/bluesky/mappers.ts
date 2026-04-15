// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * mappers.ts — pure functions that transform raw AT Protocol / Bluesky API
 * responses into domain entities. Nothing here reads from I/O or mutates state.
 */

import type { Post } from "../../domain/entities/post.ts";
import type { User } from "../../domain/entities/user.ts";
import { toHandle } from "../../domain/values/handle.ts";
import { toPostId } from "../../domain/values/post-id.ts";
import type { BlueskyPostView, BlueskyProfileResponse } from "./types.ts";

/**
 * Map a Bluesky post view to a domain Post entity.
 * Stores the AT-URI and CID in platformRef so reply chains can reference them.
 */
export function mapToDomainPost(raw: BlueskyPostView): Post {
  const replyRoot = raw.record.reply?.root;
  const inReplyToId = replyRoot !== undefined
    ? toPostId(replyRoot.uri)
    : undefined;

  return {
    id: toPostId(raw.uri),
    text: raw.record.text,
    authorHandle: toHandle(raw.author.handle),
    createdAt: new Date(raw.indexedAt),
    platform: "bluesky",
    platformRef: { uri: raw.uri, cid: raw.cid },
    ...(inReplyToId !== undefined && { inReplyToId }),
  };
}

/** Map a Bluesky actor profile to a domain User entity. */
export function mapToDomainUser(raw: BlueskyProfileResponse): User {
  return {
    id: raw.did,
    handle: toHandle(raw.handle),
    displayName: raw.displayName ?? raw.handle,
    platform: "bluesky",
    subscriptionTier: "free",
  };
}
