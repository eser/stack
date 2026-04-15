// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FeedAggregator — application service that merges timelines from all
 * authenticated platforms into a single chronologically sorted feed.
 * Uses Promise.allSettled so a single failing platform never silences others.
 */

import type { Post } from "../domain/entities/post.ts";
import type { Platform } from "../domain/values/platform.ts";
import type { AuthProvider } from "./auth-provider.ts";
import type { SocialApi } from "./social-api.ts";

/** A live connection to a specific platform's SocialApi + AuthProvider. */
export interface PlatformConnection {
  readonly platform: Platform;
  readonly socialApi: SocialApi;
  readonly auth: AuthProvider;
}

/** Application service that merges timelines across platforms. */
export interface FeedAggregator {
  /** Unified timeline from all authenticated platforms, newest post first. */
  getUnifiedTimeline(
    params?: { maxResultsPerPlatform?: number },
  ): Promise<Post[]>;
}

/** Default implementation using Promise.allSettled for fault tolerance. */
export class DefaultFeedAggregator implements FeedAggregator {
  constructor(
    private readonly connections: ReadonlyArray<PlatformConnection>,
  ) {}

  async getUnifiedTimeline(
    params?: { maxResultsPerPlatform?: number },
  ): Promise<Post[]> {
    const maxResults = params?.maxResultsPerPlatform ?? 10;

    const settled = await Promise.allSettled(
      this.connections
        .filter((conn) => conn.auth.isAuthenticated())
        .map((conn) => conn.socialApi.getTimeline({ maxResults })),
    );

    const posts: Post[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        posts.push(...result.value);
      }
      // Rejected platforms are silently skipped — the TUI shows what it has
    }

    posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return posts;
  }
}
