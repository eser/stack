// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TUI trigger adapters — transform TUI input bags into handler input types.
 *
 * Each adapter validates raw TUI fields and maps them to the strongly-typed
 * input a handler expects. AdaptErrors are returned as warnings (TUI already
 * validates via prompt validators, so AdaptErrors indicate logic bugs).
 *
 * Use `createTuiTriggers(bound)` to get context-free triggers for use in
 * a TuiMenu. The `bound` argument is produced by `createBoundTriggers(ctx)`
 * at the composition root — TuiMenu never sees PostsCtx.
 *
 * @module
 */

import * as handler from "@eserstack/functions/handler";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { Platform } from "../../domain/values/platform.ts";
import * as appHandlers from "../../application/handlers.ts";
import type { BoundTriggers } from "../../application/wiring.ts";

// ── TUI event type ─────────────────────────────────────────────────────────────

/** Loose bag of TUI-collected fields. Adapters pick what they need. */
export type TuiInput = {
  readonly rawText?: string;
  readonly platform?: Platform;
  readonly postId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly maxResults?: number;
  readonly texts?: readonly string[];
};

// ── Adapter helpers ────────────────────────────────────────────────────────────

const requireText = (
  input: TuiInput,
): results.Result<string, handler.AdaptError> => {
  const text = input.rawText?.trim();
  if (!text) return results.fail(handler.adaptError("Post text is required"));
  return results.ok(text);
};

const requirePlatform = (
  input: TuiInput,
): results.Result<Platform, handler.AdaptError> => {
  if (!input.platform) {
    return results.fail(handler.adaptError("Platform is required"));
  }
  return results.ok(input.platform);
};

const requirePostId = (
  input: TuiInput,
): results.Result<string, handler.AdaptError> => {
  if (!input.postId) {
    return results.fail(handler.adaptError("Post ID is required"));
  }
  return results.ok(input.postId);
};

// ── Adapter functions ─────────────────────────────────────────────────────────

const tuiToCompose: handler.Adapter<TuiInput, appHandlers.ComposeInput> = (
  input,
) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  return results.ok({ text: textResult.value, platform: input.platform });
};

const tuiToComposeAll: handler.Adapter<TuiInput, appHandlers.ComposeAllInput> =
  (input) => {
    const textResult = requireText(input);
    if (results.isFail(textResult)) return textResult;
    return results.ok({ text: textResult.value });
  };

const tuiToGetPost: handler.Adapter<TuiInput, appHandlers.GetPostInput> = (
  input,
) => {
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({ id: postIdResult.value, platform: platformResult.value });
};

const tuiToReply: handler.Adapter<TuiInput, appHandlers.ReplyInput> = (
  input,
) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({
    text: textResult.value,
    inReplyToId: postIdResult.value,
    platform: platformResult.value,
  });
};

const tuiToPostThread: handler.Adapter<TuiInput, appHandlers.PostThreadInput> =
  (input) => {
    if (!input.texts || input.texts.length < 2) {
      return results.fail(
        handler.adaptError("Thread requires at least 2 posts"),
      );
    }
    return results.ok({ texts: input.texts, platform: input.platform });
  };

const tuiToRepost: handler.Adapter<TuiInput, appHandlers.RepostInput> = (
  input,
) => {
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({ id: postIdResult.value, platform: platformResult.value });
};

const tuiToUndoRepost: handler.Adapter<TuiInput, appHandlers.UndoRepostInput> =
  (input) => {
    const postIdResult = requirePostId(input);
    if (results.isFail(postIdResult)) return postIdResult;
    const platformResult = requirePlatform(input);
    if (results.isFail(platformResult)) return platformResult;
    return results.ok({
      id: postIdResult.value,
      platform: platformResult.value,
    });
  };

const tuiToQuotePost: handler.Adapter<TuiInput, appHandlers.QuotePostInput> = (
  input,
) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({
    text: textResult.value,
    quotedPostId: postIdResult.value,
    platform: platformResult.value,
  });
};

const tuiToSearchPosts: handler.Adapter<
  TuiInput,
  appHandlers.SearchPostsInput
> = (input) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({
    query: textResult.value,
    platform: platformResult.value,
    maxResults: input.maxResults,
  });
};

const tuiToSearchPostsAll: handler.Adapter<
  TuiInput,
  appHandlers.SearchPostsAllInput
> = (
  input,
) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  return results.ok({
    query: textResult.value,
    maxResultsPerPlatform: input.maxResults,
  });
};

const tuiToGetTimeline: handler.Adapter<
  TuiInput,
  appHandlers.GetTimelineInput
> = (input) =>
  results.ok({ platform: input.platform, maxResults: input.maxResults });

const tuiToGetUnifiedTimeline: handler.Adapter<
  TuiInput,
  appHandlers.GetUnifiedTimelineInput
> = (input) => results.ok({ maxResultsPerPlatform: input.maxResults });

const tuiToGetBookmarks: handler.Adapter<
  TuiInput,
  appHandlers.GetBookmarksInput
> = (input) => {
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({
    platform: platformResult.value,
    maxResults: input.maxResults,
  });
};

const tuiToBookmarkPost: handler.Adapter<
  TuiInput,
  appHandlers.BookmarkPostInput
> = (input) => {
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({ id: postIdResult.value, platform: platformResult.value });
};

const tuiToRemoveBookmark: handler.Adapter<
  TuiInput,
  appHandlers.RemoveBookmarkInput
> = (
  input,
) => {
  const postIdResult = requirePostId(input);
  if (results.isFail(postIdResult)) return postIdResult;
  const platformResult = requirePlatform(input);
  if (results.isFail(platformResult)) return platformResult;
  return results.ok({ id: postIdResult.value, platform: platformResult.value });
};

const tuiToTranslateAndPost: handler.Adapter<
  TuiInput,
  appHandlers.TranslateAndPostInput
> = (
  input,
) => {
  const textResult = requireText(input);
  if (results.isFail(textResult)) return textResult;
  if (!input.from) {
    return results.fail(handler.adaptError("Source language is required"));
  }
  if (!input.to) {
    return results.fail(handler.adaptError("Target language is required"));
  }
  return results.ok({
    text: textResult.value,
    from: input.from,
    to: input.to,
    platform: input.platform,
  });
};

const tuiToGetUsage: handler.Adapter<TuiInput, appHandlers.GetUsageInput> = (
  input,
) => results.ok({ platform: input.platform });

// ── Internal helper ────────────────────────────────────────────────────────────

/** Wraps a bound (context-free) trigger with TUI input adaptation. */
function withAdapter<I, O, E>(
  boundFn: (input: I) => task.Task<O, E>,
  adapter: handler.Adapter<TuiInput, I>,
): (input: TuiInput) => task.Task<O, E | handler.AdaptError> {
  return (input: TuiInput) => {
    const adapted = adapter(input);
    if (results.isFail(adapted)) {
      return task.failTask(adapted.error) as task.Task<
        O,
        E | handler.AdaptError
      >;
    }
    return boundFn(adapted.value) as task.Task<O, E | handler.AdaptError>;
  };
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Produce context-free, TUI-adapted triggers from pre-bound handlers.
 * Pass the result to TuiMenu — it never needs to see PostsCtx.
 */
export function createTuiTriggers(bound: BoundTriggers) {
  return {
    composeTweet: withAdapter(bound.composeTweet, tuiToCompose),
    composePostToAll: withAdapter(bound.composePostToAll, tuiToComposeAll),
    translateAndPost: withAdapter(
      bound.translateAndPost,
      tuiToTranslateAndPost,
    ),
    getPost: withAdapter(bound.getPost, tuiToGetPost),
    reply: withAdapter(bound.reply, tuiToReply),
    postThread: withAdapter(bound.postThread, tuiToPostThread),
    repost: withAdapter(bound.repost, tuiToRepost),
    undoRepost: withAdapter(bound.undoRepost, tuiToUndoRepost),
    quotePost: withAdapter(bound.quotePost, tuiToQuotePost),
    searchPosts: withAdapter(bound.searchPosts, tuiToSearchPosts),
    searchPostsAll: withAdapter(bound.searchPostsAll, tuiToSearchPostsAll),
    getTimeline: withAdapter(bound.getTimeline, tuiToGetTimeline),
    getUnifiedTimeline: withAdapter(
      bound.getUnifiedTimeline,
      tuiToGetUnifiedTimeline,
    ),
    getBookmarks: withAdapter(bound.getBookmarks, tuiToGetBookmarks),
    bookmarkPost: withAdapter(bound.bookmarkPost, tuiToBookmarkPost),
    removeBookmark: withAdapter(bound.removeBookmark, tuiToRemoveBookmark),
    getUsage: withAdapter(bound.getUsage, tuiToGetUsage),
  };
}

export type TuiTriggers = ReturnType<typeof createTuiTriggers>;
