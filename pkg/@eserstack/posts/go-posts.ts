// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed social posts service.
 *
 * Wraps EserAjanPostsCreateService / Compose / GetTimeline / Search / Close
 * for posting and reading from Twitter/X and Bluesky via the native Go library.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";

export type GoPostCredentials = {
  readonly twitter?: { readonly accessToken: string };
  readonly bluesky?: { readonly accessJwt: string; readonly did: string };
};

export type GoPlatform = "twitter" | "bluesky";

export type GoPost = {
  readonly id: string;
  readonly text: string;
  readonly platform: GoPlatform;
  readonly authorHandle?: string;
};

export type GoPostService = {
  /** Post text to one or all configured platforms. */
  compose(text: string, platform?: GoPlatform): Promise<GoPost>;
  /** Fetch recent timeline. */
  getTimeline(options?: {
    platform?: GoPlatform;
    maxResults?: number;
  }): Promise<GoPost[]>;
  /** Search posts. */
  search(query: string, options?: {
    platform?: GoPlatform;
    maxResults?: number;
  }): Promise<GoPost[]>;
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
 * import { createGoPostService } from "@eserstack/posts/go-posts";
 *
 * const svc = await createGoPostService({
 *   twitter: { accessToken: Deno.env.get("TWITTER_TOKEN")! },
 * });
 * await svc.compose("Hello from Go!");
 * svc.close();
 * ```
 */
export const createGoPostService = async (
  credentials: GoPostCredentials,
): Promise<GoPostService> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for createGoPostService");
  }

  const raw = lib.symbols.EserAjanPostsCreateService(
    JSON.stringify(credentials),
  );
  const result = JSON.parse(raw) as { handle: string; error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  const handle = result.handle;

  return {
    compose(text: string, platform?: GoPlatform): Promise<GoPost> {
      const lib2 = getLib();
      if (lib2 === null) return Promise.reject(new Error("native library unavailable"));

      const raw2 = lib2.symbols.EserAjanPostsCompose(
        JSON.stringify({ handle, text, platform }),
      );
      const res = JSON.parse(raw2) as { post: GoPost; error?: string };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.post);
    },

    getTimeline(
      options: { platform?: GoPlatform; maxResults?: number } = {},
    ): Promise<GoPost[]> {
      const lib2 = getLib();
      if (lib2 === null) return Promise.reject(new Error("native library unavailable"));

      const raw2 = lib2.symbols.EserAjanPostsGetTimeline(
        JSON.stringify({ handle, ...options }),
      );
      const res = JSON.parse(raw2) as { posts: GoPost[]; error?: string };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.posts);
    },

    search(
      query: string,
      options: { platform?: GoPlatform; maxResults?: number } = {},
    ): Promise<GoPost[]> {
      const lib2 = getLib();
      if (lib2 === null) return Promise.reject(new Error("native library unavailable"));

      const raw2 = lib2.symbols.EserAjanPostsSearch(
        JSON.stringify({ handle, query, ...options }),
      );
      const res = JSON.parse(raw2) as { posts: GoPost[]; error?: string };
      if (res.error) return Promise.reject(new Error(res.error));
      return Promise.resolve(res.posts);
    },

    close(): void {
      const lib2 = getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanPostsClose(JSON.stringify({ handle }));
    },
  };
};
