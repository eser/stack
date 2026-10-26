// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Composition root for context threading.
 *
 * `createBoundTriggers(ctx)` satisfies all handler Requirements (`PostsCtx`)
 * once, at the edge of the system. Every returned function is a context-free
 * `Task<T, E>` — callers pass only business input, never infrastructure.
 *
 * Analogous to Effect.ts `Layer.provide()` or Haskell's `runReaderT`.
 *
 * @module
 */

import * as taskMod from "@eserstack/functions/task";
import type { Post } from "../domain/entities/post.ts";
import type { UsageData } from "../domain/entities/usage.ts";
import type { PostsCtx } from "./context.ts";
import * as handlers from "./handlers.ts";

/** Adapters depend on this type — never on PostsCtx directly. */
export type BoundTriggers = {
  composeTweet: (input: handlers.ComposeInput) => taskMod.Task<Post, Error>;
  composePostToAll: (
    input: handlers.ComposeAllInput,
  ) => taskMod.Task<Post[], Error>;
  translateAndPost: (
    input: handlers.TranslateAndPostInput,
  ) => taskMod.Task<Post, Error>;
  getPost: (input: handlers.GetPostInput) => taskMod.Task<Post, Error>;
  reply: (input: handlers.ReplyInput) => taskMod.Task<Post, Error>;
  postThread: (input: handlers.PostThreadInput) => taskMod.Task<Post[], Error>;
  repost: (input: handlers.RepostInput) => taskMod.Task<void, Error>;
  undoRepost: (input: handlers.UndoRepostInput) => taskMod.Task<void, Error>;
  quotePost: (input: handlers.QuotePostInput) => taskMod.Task<Post, Error>;
  searchPosts: (
    input: handlers.SearchPostsInput,
  ) => taskMod.Task<Post[], Error>;
  searchPostsAll: (
    input: handlers.SearchPostsAllInput,
  ) => taskMod.Task<Post[], Error>;
  getTimeline: (
    input: handlers.GetTimelineInput,
  ) => taskMod.Task<Post[], Error>;
  getUnifiedTimeline: (
    input: handlers.GetUnifiedTimelineInput,
  ) => taskMod.Task<Post[], Error>;
  getBookmarks: (
    input: handlers.GetBookmarksInput,
  ) => taskMod.Task<Post[], Error>;
  bookmarkPost: (
    input: handlers.BookmarkPostInput,
  ) => taskMod.Task<void, Error>;
  removeBookmark: (
    input: handlers.RemoveBookmarkInput,
  ) => taskMod.Task<void, Error>;
  getUsage: (input: handlers.GetUsageInput) => taskMod.Task<UsageData, Error>;
};

/**
 * Bind PostsCtx into every handler, returning a map of context-free triggers.
 * Call this once at the composition root; pass the result to adapters.
 */
export function createBoundTriggers(ctx: PostsCtx): BoundTriggers {
  return {
    composeTweet: (input: handlers.ComposeInput) =>
      taskMod.provideContext(handlers.composeTweetHandler(input), ctx),

    composePostToAll: (input: handlers.ComposeAllInput) =>
      taskMod.provideContext(handlers.composePostToAllHandler(input), ctx),

    translateAndPost: (input: handlers.TranslateAndPostInput) =>
      taskMod.provideContext(handlers.translateAndPostHandler(input), ctx),

    getPost: (input: handlers.GetPostInput) =>
      taskMod.provideContext(handlers.getPostHandler(input), ctx),

    reply: (input: handlers.ReplyInput) =>
      taskMod.provideContext(handlers.replyHandler(input), ctx),

    postThread: (input: handlers.PostThreadInput) =>
      taskMod.provideContext(handlers.postThreadHandler(input), ctx),

    repost: (input: handlers.RepostInput) =>
      taskMod.provideContext(handlers.repostHandler(input), ctx),

    undoRepost: (input: handlers.UndoRepostInput) =>
      taskMod.provideContext(handlers.undoRepostHandler(input), ctx),

    quotePost: (input: handlers.QuotePostInput) =>
      taskMod.provideContext(handlers.quotePostHandler(input), ctx),

    searchPosts: (input: handlers.SearchPostsInput) =>
      taskMod.provideContext(handlers.searchPostsHandler(input), ctx),

    searchPostsAll: (input: handlers.SearchPostsAllInput) =>
      taskMod.provideContext(handlers.searchPostsAllHandler(input), ctx),

    getTimeline: (input: handlers.GetTimelineInput) =>
      taskMod.provideContext(handlers.getTimelineHandler(input), ctx),

    getUnifiedTimeline: (input: handlers.GetUnifiedTimelineInput) =>
      taskMod.provideContext(handlers.getUnifiedTimelineHandler(input), ctx),

    getBookmarks: (input: handlers.GetBookmarksInput) =>
      taskMod.provideContext(handlers.getBookmarksHandler(input), ctx),

    bookmarkPost: (input: handlers.BookmarkPostInput) =>
      taskMod.provideContext(handlers.bookmarkPostHandler(input), ctx),

    removeBookmark: (input: handlers.RemoveBookmarkInput) =>
      taskMod.provideContext(handlers.removeBookmarkHandler(input), ctx),

    getUsage: (input: handlers.GetUsageInput) =>
      taskMod.provideContext(handlers.getUsageHandler(input), ctx),
  };
}
