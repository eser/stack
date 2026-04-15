// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Handler definitions for all PostService use cases.
 *
 * Each handler is `(input: I) => Task<O, Error, PostsCtx>`.
 * Handlers are pure business logic — they declare what context they need
 * (`PostsCtx`) but are agnostic of how they're triggered (TUI, CLI, HTTP).
 *
 * Bind to a trigger source using `handler.bind()` from @eserstack/functions/handler:
 * ```ts
 * const fromTui = handler.bind(composeTweetHandler, tuiToComposeAdapter);
 * const result = await task.runTask(fromTui(tuiEvent), postsCtx);
 * ```
 *
 * @module
 */

import * as handler from "@eserstack/functions/handler";
import * as taskMod from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { Post } from "../domain/entities/post.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { Platform } from "../domain/values/platform.ts";
import * as postIdValues from "../domain/values/post-id.ts";
import type { PostsCtx } from "./context.ts";
import { FanOutPartialError } from "./fan-out-partial-error.ts";
import type { FanOutFailure } from "./fan-out-partial-error.ts";
import { withFreshTokens } from "./with-fresh-tokens.ts";

// ── Input types ────────────────────────────────────────────────────────────────

export type ComposeInput = {
  readonly text: string;
  readonly platform?: Platform;
};

export type ComposeAllInput = {
  readonly text: string;
};

export type GetPostInput = {
  readonly id: string;
  readonly platform: Platform;
};

export type ReplyInput = {
  readonly text: string;
  readonly inReplyToId: string;
  readonly platform: Platform;
};

export type PostThreadInput = {
  readonly texts: readonly string[];
  readonly platform?: Platform;
};

export type RepostInput = {
  readonly id: string;
  readonly platform: Platform;
};

export type UndoRepostInput = {
  readonly id: string;
  readonly platform: Platform;
};

export type QuotePostInput = {
  readonly text: string;
  readonly quotedPostId: string;
  readonly platform: Platform;
};

export type SearchPostsInput = {
  readonly query: string;
  readonly platform: Platform;
  readonly maxResults?: number;
};

export type SearchPostsAllInput = {
  readonly query: string;
  readonly maxResultsPerPlatform?: number;
};

export type GetTimelineInput = {
  readonly platform?: Platform;
  readonly maxResults?: number;
};

export type GetUnifiedTimelineInput = {
  readonly maxResultsPerPlatform?: number;
};

export type GetBookmarksInput = {
  readonly platform: Platform;
  readonly maxResults?: number;
};

export type BookmarkPostInput = {
  readonly id: string;
  readonly platform: Platform;
};

export type RemoveBookmarkInput = {
  readonly id: string;
  readonly platform: Platform;
};

export type TranslateAndPostInput = {
  readonly text: string;
  readonly from: string;
  readonly to: string;
  readonly platform?: Platform;
};

export type GetUsageInput = {
  readonly platform?: Platform;
};

// ── Handlers ───────────────────────────────────────────────────────────────────

export const composeTweetHandler: handler.Handler<
  ComposeInput,
  Post,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) => {
    const { platform } = input;
    if (platform !== undefined) {
      return withFreshTokens(ctx, platform, () =>
        ctx.postService.composePost(input.text, platform));
    }
    return ctx.postService.composePost(input.text, platform);
  });

/**
 * Cross-post to all authenticated platforms.
 * Each platform is individually bracketed with withFreshTokens so token refresh
 * happens per-platform rather than being skipped entirely.
 *
 * Returns ok(Post[]) when all platforms succeed.
 * Returns fail(FanOutPartialError) when any platform fails — the error carries
 * both the successful posts and per-platform failure details.
 */
export const composePostToAllHandler: handler.Handler<
  ComposeAllInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task(async (ctx) => {
    const platforms = ctx.auths !== undefined
      ? Array.from(ctx.auths.keys())
      : [];

    if (platforms.length === 0) {
      // No auth map — fall back to service fan-out
      const serviceResult = await ctx.postService.composePostToAll(input.text);
      if (results.isFail(serviceResult)) return serviceResult;
      return results.ok(
        serviceResult.value
          .filter((r) => r.post !== undefined)
          .map((r) => r.post as Post),
      );
    }

    const posted: Post[] = [];
    const failed: FanOutFailure[] = [];

    for (const platform of platforms) {
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens(
        ctx,
        platform,
        () => ctx.postService.composePost(input.text, platform),
      );
      if (results.isOk(result)) {
        posted.push(result.value);
      } else {
        failed.push({ platform, error: result.error });
      }
    }

    if (failed.length === 0) return results.ok(posted);
    return results.fail(
      new FanOutPartialError({
        posted,
        failed,
        totalPlatforms: platforms.length,
      }),
    );
  });

export const translateAndPostHandler: handler.Handler<
  TranslateAndPostInput,
  Post,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) => {
    const { platform } = input;
    if (platform !== undefined) {
      return withFreshTokens(ctx, platform, () =>
        ctx.postService.translateAndPost({
          text: input.text,
          from: input.from,
          to: input.to,
          platform,
        }));
    }
    return ctx.postService.translateAndPost({
      text: input.text,
      from: input.from,
      to: input.to,
      platform,
    });
  });

export const getPostHandler: handler.Handler<
  GetPostInput,
  Post,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(
      ctx,
      input.platform,
      () =>
        ctx.postService.getPost(
          postIdValues.toPostId(input.id),
          input.platform,
        ),
    )
  );

export const replyHandler: handler.Handler<ReplyInput, Post, Error, PostsCtx> =
  (input) =>
    taskMod.task((ctx) =>
      withFreshTokens(ctx, input.platform, async () => {
        const originalResult = await ctx.postService.getPost(
          postIdValues.toPostId(input.inReplyToId),
          input.platform,
        );
        if (results.isFail(originalResult)) return originalResult;
        return ctx.postService.replyToPost({
          text: input.text,
          inReplyToPost: originalResult.value,
        });
      })
    );

/**
 * Post a thread to a single platform.
 * Uses withFreshTokens when platform is specified — mirrors the pattern
 * used by composeTweetHandler and getTimelineHandler.
 */
export const postThreadHandler: handler.Handler<
  PostThreadInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) => {
    const { platform } = input;
    if (platform !== undefined) {
      return withFreshTokens(ctx, platform, () =>
        ctx.postService.postThread(input.texts, platform));
    }
    return ctx.postService.postThread(input.texts, platform);
  });

export const repostHandler: handler.Handler<
  RepostInput,
  void,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.repost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }))
  );

export const undoRepostHandler: handler.Handler<
  UndoRepostInput,
  void,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.undoRepost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }))
  );

export const quotePostHandler: handler.Handler<
  QuotePostInput,
  Post,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.quotePost({
        text: input.text,
        quotedPostId: postIdValues.toPostId(input.quotedPostId),
        platform: input.platform,
      }))
  );

export const searchPostsHandler: handler.Handler<
  SearchPostsInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.searchPosts({
        query: input.query,
        platform: input.platform,
        maxResults: input.maxResults,
      }))
  );

/**
 * Search across all authenticated platforms.
 * Each platform is individually bracketed so token refresh happens per-platform.
 * Per-platform failures are silently dropped — partial results are better than none.
 */
export const searchPostsAllHandler: handler.Handler<
  SearchPostsAllInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task(async (ctx) => {
    const platforms = ctx.auths !== undefined
      ? Array.from(ctx.auths.keys())
      : [];

    if (platforms.length === 0) {
      return ctx.postService.searchPostsAll({
        query: input.query,
        maxResultsPerPlatform: input.maxResultsPerPlatform,
      });
    }

    const all: Post[] = [];
    for (const platform of platforms) {
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens(ctx, platform, () =>
        ctx.postService.searchPosts({
          query: input.query,
          platform,
          maxResults: input.maxResultsPerPlatform,
        }));
      if (results.isOk(result)) {
        all.push(...result.value);
      }
      // Silently drop per-platform failures — partial results are useful
    }

    return results.ok(
      all.sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()
      ),
    );
  });

export const getTimelineHandler: handler.Handler<
  GetTimelineInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) => {
    const { platform } = input;
    if (platform !== undefined) {
      return withFreshTokens(ctx, platform, () =>
        ctx.postService.getTimeline({
          maxResults: input.maxResults,
          platform,
        }));
    }
    return ctx.postService.getTimeline({
      maxResults: input.maxResults,
      platform,
    });
  });

/**
 * Fetch unified timeline from all authenticated platforms.
 * Each platform is individually bracketed for token refresh.
 * Per-platform failures are silently dropped — a partial timeline is still useful.
 */
export const getUnifiedTimelineHandler: handler.Handler<
  GetUnifiedTimelineInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task(async (ctx) => {
    const platforms = ctx.auths !== undefined
      ? Array.from(ctx.auths.keys())
      : [];

    if (platforms.length === 0) {
      return ctx.postService.getUnifiedTimeline({
        maxResultsPerPlatform: input.maxResultsPerPlatform,
      });
    }

    const all: Post[] = [];
    for (const platform of platforms) {
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens(ctx, platform, () =>
        ctx.postService.getTimeline({
          platform,
          maxResults: input.maxResultsPerPlatform,
        }));
      if (results.isOk(result)) {
        all.push(...result.value);
      }
      // Silently drop per-platform failures — partial timeline is still useful
    }

    return results.ok(
      all.sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()
      ),
    );
  });

export const getBookmarksHandler: handler.Handler<
  GetBookmarksInput,
  Post[],
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.getBookmarks({
        platform: input.platform,
        maxResults: input.maxResults,
      }))
  );

export const bookmarkPostHandler: handler.Handler<
  BookmarkPostInput,
  void,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.bookmarkPost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }))
  );

export const removeBookmarkHandler: handler.Handler<
  RemoveBookmarkInput,
  void,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) =>
    withFreshTokens(ctx, input.platform, () =>
      ctx.postService.removeBookmark({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }))
  );

/**
 * Get API usage data.
 * Uses withFreshTokens when platform is specified — mirrors the pattern
 * used by composeTweetHandler and getTimelineHandler.
 */
export const getUsageHandler: handler.Handler<
  GetUsageInput,
  UsageData,
  Error,
  PostsCtx
> = (input) =>
  taskMod.task((ctx) => {
    const { platform } = input;
    if (platform !== undefined) {
      return withFreshTokens(ctx, platform, () =>
        ctx.postService.getUsage(platform));
    }
    return ctx.postService.getUsage(platform);
  });
