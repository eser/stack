// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Handler definitions for all PostService use cases.
 *
 * Each handler is `(input: I) => Task<O, Error, PostsCtx>`.
 * Handlers are pure business logic: they declare what context they need
 * (`PostsCtx`) but are agnostic of how they're triggered (TUI, CLI, HTTP).
 *
 * Bind to a trigger source using `handler.bind()` from @eserstack/functions:
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 * import * as posts from "@eserstack/posts";
 *
 * declare const postsCtx: posts.PostsCtx;
 *
 * const fromText = functions.handler.bind(
 *   posts.handlers.composeTweetHandler,
 *   (text: string) =>
 *     primitives.results.ok({ text, platform: "bluesky" as const }),
 * );
 * const result = await functions.task.runTask(fromText("Hello"), postsCtx);
 * ```
 *
 * @module
 */

import * as taskMod from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { Post } from "../domain/entities/post.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { Platform } from "../domain/values/platform.ts";
import * as postIdValues from "../domain/values/post-id.ts";
import type { PostsCtx } from "./context.ts";
import * as defaults from "./defaults.ts";
import * as fanOutPartialError from "./fan-out-partial-error.ts";
import type { FanOutFailure } from "./fan-out-partial-error.ts";
import type { PostResult } from "./post-service.ts";
import * as withFreshTokens from "./with-fresh-tokens.ts";

// ── Input types ────────────────────────────────────────────────────────────────

/** Input of composeTweetHandler: one post on one platform. */
export type ComposeInput = {
  /** The post text. */
  readonly text: string;
  /** Where to publish; the first platform in ctx.auths when left out. */
  readonly platform?: Platform;
};

/** Input of composePostToAllHandler: the same post on every platform. */
export type ComposeAllInput = {
  /** The post text; it must fit every platform's limit. */
  readonly text: string;
};

/** Input of getPostHandler: one post by ID. */
export type GetPostInput = {
  /** The post ID: numeric on Twitter/X, an at:// URI on Bluesky. */
  readonly id: string;
  /** The platform the post lives on. */
  readonly platform: Platform;
};

/** Input of replyHandler: a reply to an existing post. */
export type ReplyInput = {
  /** The reply text. */
  readonly text: string;
  /** The ID of the post to reply to. */
  readonly inReplyToId: string;
  /** The platform both posts live on. */
  readonly platform: Platform;
};

/** Input of postThreadHandler: a thread on one platform. */
export type PostThreadInput = {
  /** The post texts in thread order. */
  readonly texts: readonly string[];
  /** Where to publish; the first platform in ctx.auths when left out. */
  readonly platform?: Platform;
};

/** Input of repostHandler: a repost without commentary. */
export type RepostInput = {
  /** The ID of the post to repost. */
  readonly id: string;
  /** The platform the post lives on. */
  readonly platform: Platform;
};

/** Input of undoRepostHandler: the repost to remove. */
export type UndoRepostInput = {
  /** The ID of the original post whose repost to remove. */
  readonly id: string;
  /** The platform the post lives on. */
  readonly platform: Platform;
};

/** Input of quotePostHandler: a post that embeds another post. */
export type QuotePostInput = {
  /** The commentary text. */
  readonly text: string;
  /** The ID of the post to quote. */
  readonly quotedPostId: string;
  /** The platform both posts live on. */
  readonly platform: Platform;
};

/** Input of searchPostsHandler: a search on one platform. */
export type SearchPostsInput = {
  /** The search query. */
  readonly query: string;
  /** The platform to search. */
  readonly platform: Platform;
  /** The most posts to return; the platform's own default when left out. */
  readonly maxResults?: number;
};

/** Input of searchPostsAllHandler: a search on every platform. */
export type SearchPostsAllInput = {
  /** The search query. */
  readonly query: string;
  /**
   * The most posts to ask each platform for;
   * `DEFAULT_MAX_RESULTS_PER_PLATFORM` (10) when left out.
   */
  readonly maxResultsPerPlatform?: number;
};

/** Input of getTimelineHandler: the timeline of one platform. */
export type GetTimelineInput = {
  /** Which timeline; the first platform in ctx.auths when left out. */
  readonly platform?: Platform;
  /** The most posts to return; the platform's own default when left out. */
  readonly maxResults?: number;
};

/** Input of getUnifiedTimelineHandler: every platform's timeline merged. */
export type GetUnifiedTimelineInput = {
  /**
   * The most posts to ask each platform for;
   * `DEFAULT_MAX_RESULTS_PER_PLATFORM` (10) when left out.
   */
  readonly maxResultsPerPlatform?: number;
};

/** Input of getBookmarksHandler: the bookmarks on one platform. */
export type GetBookmarksInput = {
  /** The platform whose bookmarks to list. */
  readonly platform: Platform;
  /** The most posts to return; the platform's own default when left out. */
  readonly maxResults?: number;
};

/** Input of bookmarkPostHandler: the post to bookmark. */
export type BookmarkPostInput = {
  /** The ID of the post to bookmark. */
  readonly id: string;
  /** The platform the post lives on. */
  readonly platform: Platform;
};

/** Input of removeBookmarkHandler: the bookmark to remove. */
export type RemoveBookmarkInput = {
  /** The ID of the bookmarked post. */
  readonly id: string;
  /** The platform the post lives on. */
  readonly platform: Platform;
};

/** Input of translateAndPostHandler: a text to translate, then publish. */
export type TranslateAndPostInput = {
  /** The text in the source language. */
  readonly text: string;
  /** The source language as a BCP 47 code. */
  readonly from: string;
  /** The target language as a BCP 47 code. */
  readonly to: string;
  /** Where to publish; the first platform in ctx.auths when left out. */
  readonly platform?: Platform;
};

/** Input of getUsageHandler: the platform whose API usage to read. */
export type GetUsageInput = {
  /** Which platform; the first platform in ctx.auths when left out. */
  readonly platform?: Platform;
};

// ── Platform resolution ────────────────────────────────────────────────────────

/** The platforms in ctx.auths, in order; empty without auth providers. */
const authPlatforms = (ctx: PostsCtx): Platform[] =>
  ctx.auths !== undefined ? Array.from(ctx.auths.keys()) : [];

/** The first platform in ctx.auths, or undefined when there is none. */
const firstAuthPlatform = (ctx: PostsCtx): Platform | undefined => {
  if (ctx.auths === undefined) return undefined;
  const first = ctx.auths.keys().next();
  return first.done === true ? undefined : first.value;
};

/**
 * Run an operation on the platform the input names, or on the default one
 * when it names none, inside withFreshTokens so that platform's saved tokens
 * are loaded, refreshed when they expire, and saved back.
 *
 * The default is the first platform in ctx.auths. A context without auth
 * providers leaves the choice to the PostService, which picks its first
 * configured platform.
 */
const onPlatform = <T>(
  ctx: PostsCtx,
  requested: Platform | undefined,
  operation: (
    platform: Platform | undefined,
  ) => Promise<results.Result<T, Error>>,
): Promise<results.Result<T, Error>> => {
  const platform = requested ?? firstAuthPlatform(ctx);
  if (platform === undefined) return operation(undefined);
  return withFreshTokens.withFreshTokens(ctx, platform, () =>
    operation(platform),
  );
};

// ── Fan-out reporting ──────────────────────────────────────────────────────────

/**
 * The outcome of a cross-post, from one entry per attempted platform: every
 * post when all platforms published, a FanOutPartialError when any failed,
 * and an error when there was no platform to publish on. Both paths of
 * composePostToAllHandler report through it, so a partial failure looks the
 * same whichever path ran.
 */
const reportFanOut = (
  perPlatform: readonly PostResult[],
): results.Result<Post[], Error> => {
  if (perPlatform.length === 0) {
    return results.fail(
      new Error(
        "Cross-post has no platform to publish on, so nothing was published. Configure a platform and log in to it first.",
      ),
    );
  }

  const posted: Post[] = [];
  const failed: FanOutFailure[] = [];
  for (const entry of perPlatform) {
    if (entry.post !== undefined) {
      posted.push(entry.post);
      continue;
    }
    failed.push({
      platform: entry.platform,
      // PostResult allows an entry with neither field; it is still a failure.
      error:
        entry.error ??
        new Error(`${entry.platform} returned neither a post nor an error`),
    });
  }

  if (failed.length === 0) return results.ok(posted);
  return results.fail(
    new fanOutPartialError.FanOutPartialError({
      posted,
      failed,
      totalPlatforms: perPlatform.length,
    }),
  );
};

/** Merge per-platform reads into one list, newest post first. */
const newestFirst = (posts: Post[]): Post[] =>
  posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

// ── Handlers ───────────────────────────────────────────────────────────────────

/**
 * Publish one post on the platform the input names, or on the default
 * platform (the first in ctx.auths) when it names none.
 */
export const composeTweetHandler = (
  input: ComposeInput,
): taskMod.Task<Post, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    onPlatform(ctx, input.platform, (platform) =>
      ctx.postService.composePost(input.text, platform),
    ),
  );

/**
 * Cross-post to every platform, one after another.
 *
 * With auth providers, the platforms are those in ctx.auths, each bracketed
 * with withFreshTokens so its tokens are loaded, refreshed and saved. Without
 * them, the PostService cross-posts over its own platforms, also in order.
 * Both paths report the same way: ok(Post[]) when every platform published,
 * fail(FanOutPartialError) carrying the published posts and the per-platform
 * failures when any failed, and a failure when there is no platform at all.
 */
export const composePostToAllHandler = (
  input: ComposeAllInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task(async (ctx) => {
    const platforms = authPlatforms(ctx);

    if (platforms.length === 0) {
      const serviceResult = await ctx.postService.composePostToAll(input.text);
      if (results.isFail(serviceResult)) return serviceResult;
      return reportFanOut(serviceResult.value);
    }

    const perPlatform: PostResult[] = [];
    for (const platform of platforms) {
      // withFreshTokens saves each platform's tokens to one shared token file;
      // concurrent saves would overwrite each other.
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
        ctx.postService.composePost(input.text, platform),
      );
      perPlatform.push(
        results.isOk(result)
          ? { platform, post: result.value }
          : { platform, error: result.error },
      );
    }

    return reportFanOut(perPlatform);
  });

/**
 * Translate the text, then publish it on the platform the input names, or on
 * the default platform (the first in ctx.auths) when it names none.
 */
export const translateAndPostHandler = (
  input: TranslateAndPostInput,
): taskMod.Task<Post, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    onPlatform(ctx, input.platform, (platform) =>
      ctx.postService.translateAndPost({
        text: input.text,
        from: input.from,
        to: input.to,
        platform,
      }),
    ),
  );

/** Fetch one post by its ID from the platform the input names. */
export const getPostHandler = (
  input: GetPostInput,
): taskMod.Task<Post, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.getPost(postIdValues.toPostId(input.id), input.platform),
    ),
  );

/**
 * Fetch the post to reply to, then publish the reply under it on the same
 * platform.
 */
export const replyHandler = (
  input: ReplyInput,
): taskMod.Task<Post, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, async () => {
      const originalResult = await ctx.postService.getPost(
        postIdValues.toPostId(input.inReplyToId),
        input.platform,
      );
      if (results.isFail(originalResult)) return originalResult;
      return await ctx.postService.replyToPost({
        text: input.text,
        inReplyToPost: originalResult.value,
      });
    }),
  );

/**
 * Post a thread to a single platform: the one the input names, or the default
 * platform (the first in ctx.auths) when it names none. A post that fails
 * stops the thread with a ThreadPartialError that carries the posts already
 * published.
 */
export const postThreadHandler = (
  input: PostThreadInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task((ctx) =>
    onPlatform(ctx, input.platform, (platform) =>
      ctx.postService.postThread(input.texts, platform),
    ),
  );

/** Repost a post without commentary on the platform the input names. */
export const repostHandler = (
  input: RepostInput,
): taskMod.Task<void, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.repost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }),
    ),
  );

/** Remove your repost of a post on the platform the input names. */
export const undoRepostHandler = (
  input: UndoRepostInput,
): taskMod.Task<void, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.undoRepost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }),
    ),
  );

/** Publish a post that quotes another one, on the platform the input names. */
export const quotePostHandler = (
  input: QuotePostInput,
): taskMod.Task<Post, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.quotePost({
        text: input.text,
        quotedPostId: postIdValues.toPostId(input.quotedPostId),
        platform: input.platform,
      }),
    ),
  );

/** Search for posts on the platform the input names. */
export const searchPostsHandler = (
  input: SearchPostsInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.searchPosts({
        query: input.query,
        platform: input.platform,
        maxResults: input.maxResults,
      }),
    ),
  );

/**
 * Search every platform and merge the results, newest first.
 *
 * Each platform is asked for `maxResultsPerPlatform` posts, or
 * `DEFAULT_MAX_RESULTS_PER_PLATFORM` (10) when the input sets none, with or
 * without auth providers. With auth providers each platform is bracketed so
 * its tokens refresh; without them the PostService searches its own
 * platforms. On both paths a platform that fails is left out, since the
 * other platforms' results are still useful.
 */
export const searchPostsAllHandler = (
  input: SearchPostsAllInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task(async (ctx) => {
    const maxResults =
      input.maxResultsPerPlatform ?? defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM;
    const platforms = authPlatforms(ctx);

    if (platforms.length === 0) {
      return await ctx.postService.searchPostsAll({
        query: input.query,
        maxResultsPerPlatform: maxResults,
      });
    }

    const all: Post[] = [];
    for (const platform of platforms) {
      // withFreshTokens saves each platform's tokens to one shared token file;
      // concurrent saves would overwrite each other.
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
        ctx.postService.searchPosts({
          query: input.query,
          platform,
          maxResults,
        }),
      );
      // A failed platform is left out, as the PostService does on the other
      // path; a search on that platform alone shows the error.
      if (results.isOk(result)) {
        all.push(...result.value);
      }
    }

    return results.ok(newestFirst(all));
  });

/**
 * Fetch the timeline of the platform the input names, or of the default
 * platform (the first in ctx.auths) when it names none.
 */
export const getTimelineHandler = (
  input: GetTimelineInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task((ctx) =>
    onPlatform(ctx, input.platform, (platform) =>
      ctx.postService.getTimeline({
        maxResults: input.maxResults,
        platform,
      }),
    ),
  );

/**
 * Fetch the timelines of every platform and merge them, newest first.
 *
 * Each platform is asked for `maxResultsPerPlatform` posts, or
 * `DEFAULT_MAX_RESULTS_PER_PLATFORM` (10) when the input sets none, with or
 * without auth providers. With auth providers each platform is bracketed so
 * its tokens refresh; without them the FeedAggregator reads the
 * authenticated platforms. On both paths a platform that fails is left out,
 * since a partial timeline is still useful.
 */
export const getUnifiedTimelineHandler = (
  input: GetUnifiedTimelineInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task(async (ctx) => {
    const maxResults =
      input.maxResultsPerPlatform ?? defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM;
    const platforms = authPlatforms(ctx);

    if (platforms.length === 0) {
      return await ctx.postService.getUnifiedTimeline({
        maxResultsPerPlatform: maxResults,
      });
    }

    const all: Post[] = [];
    for (const platform of platforms) {
      // withFreshTokens saves each platform's tokens to one shared token file;
      // concurrent saves would overwrite each other.
      // deno-lint-ignore no-await-in-loop
      const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
        ctx.postService.getTimeline({ platform, maxResults }),
      );
      // A failed platform is left out, as the FeedAggregator does on the
      // other path.
      if (results.isOk(result)) {
        all.push(...result.value);
      }
    }

    return results.ok(newestFirst(all));
  });

/** List the bookmarks on the platform the input names. */
export const getBookmarksHandler = (
  input: GetBookmarksInput,
): taskMod.Task<Post[], Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.getBookmarks({
        platform: input.platform,
        maxResults: input.maxResults,
      }),
    ),
  );

/** Add a post to your bookmarks on the platform the input names. */
export const bookmarkPostHandler = (
  input: BookmarkPostInput,
): taskMod.Task<void, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.bookmarkPost({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }),
    ),
  );

/** Remove a post from your bookmarks on the platform the input names. */
export const removeBookmarkHandler = (
  input: RemoveBookmarkInput,
): taskMod.Task<void, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    withFreshTokens.withFreshTokens(ctx, input.platform, () =>
      ctx.postService.removeBookmark({
        id: postIdValues.toPostId(input.id),
        platform: input.platform,
      }),
    ),
  );

/**
 * Get API usage data for the platform the input names, or for the default
 * platform (the first in ctx.auths) when it names none.
 */
export const getUsageHandler = (
  input: GetUsageInput,
): taskMod.Task<UsageData, Error, PostsCtx> =>
  taskMod.task((ctx) =>
    onPlatform(ctx, input.platform, (platform) =>
      ctx.postService.getUsage(platform),
    ),
  );
