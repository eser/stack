// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed social posts service.
 *
 * Wraps the bridge's postsCreateService, postsCompose, postsGetTimeline,
 * postsSearch and postsClose calls for posting and reading from Twitter/X and
 * Bluesky via the native Go library.
 *
 * @module
 */

import * as ffiClient from "./ffi-client.ts";

/** The access tokens the Go service posts and reads with, per platform. */
export type GoPostCredentials = {
  readonly twitter?: { readonly accessToken: string };
  readonly bluesky?: { readonly accessJwt: string; readonly did: string };
};

/** A platform the Go service supports. */
export type GoPlatform = "twitter" | "bluesky";

/** A post as the Go service returns it. */
export type GoPost = {
  readonly id: string;
  readonly text: string;
  readonly platform: GoPlatform;
  readonly authorHandle?: string;
};

/** A Go-backed service handle; call `close` to release it. */
export type GoPostService = {
  /** Post text to one or all configured platforms. */
  compose(text: string, platform?: GoPlatform): Promise<GoPost>;
  /** Fetch recent timeline. */
  getTimeline(options?: {
    platform?: GoPlatform;
    maxResults?: number;
  }): Promise<GoPost[]>;
  /** Search posts. */
  search(
    query: string,
    options?: {
      platform?: GoPlatform;
      maxResults?: number;
    },
  ): Promise<GoPost[]>;
  /** Release the Go handle. */
  close(): void;
};

/**
 * Creates a Go-backed posts service handle.
 *
 * @throws Error if the native library is unavailable or credentials are invalid.
 *
 * @example
 * ```typescript
 * import * as goPosts from "@eserstack/posts/go-posts";
 * import { runtime } from "@eserstack/standards/cross-runtime";
 *
 * const svc = await goPosts.createGoPostService({
 *   twitter: { accessToken: runtime.env.get("TWITTER_TOKEN")! },
 * });
 * await svc.compose("Hello from Go!");
 * svc.close();
 * ```
 */
export const createGoPostService = async (
  credentials: GoPostCredentials,
): Promise<GoPostService> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for createGoPostService");
  }

  const result = lib.call("postsCreateService", credentials);

  if (result.error) {
    throw new Error(result.error);
  }

  const handle = result.handle ?? "";

  return {
    compose(text: string, platform?: GoPlatform): Promise<GoPost> {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) {
        return Promise.reject(new Error("native library unavailable"));
      }

      const res = lib2.call("postsCompose", { handle, text, platform }) as {
        post: GoPost;
        error?: string;
      };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.post);
    },

    getTimeline(
      options: { platform?: GoPlatform; maxResults?: number } = {},
    ): Promise<GoPost[]> {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) {
        return Promise.reject(new Error("native library unavailable"));
      }

      const res = lib2.call("postsGetTimeline", { handle, ...options }) as {
        posts: GoPost[];
        error?: string;
      };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.posts);
    },

    search(
      query: string,
      options: { platform?: GoPlatform; maxResults?: number } = {},
    ): Promise<GoPost[]> {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) {
        return Promise.reject(new Error("native library unavailable"));
      }

      const res = lib2.call("postsSearch", { handle, query, ...options }) as {
        posts: GoPost[];
        error?: string;
      };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.posts);
    },

    close(): void {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) return;
      lib2.call("postsClose", { handle });
    },
  };
};
