// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AI tool-call trigger adapters for @eserstack/posts.
 *
 * `routeToolCall(bound, event)` dispatches a model tool call to the matching
 * bound trigger and returns a `ToolCallResponse` ready to feed back into the
 * conversation. The model is already constrained by JSON Schema parameters in
 * tool-definitions.ts, so argument validation here is minimal — just cast and
 * forward.
 *
 * `createToolCallTrigger(bound)` wraps `routeToolCall` into a single-arg
 * function for use in the agent loop.
 *
 * @module
 */

import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type * as appHandlers from "../../application/handlers.ts";
import type { BoundTriggers } from "../../application/wiring.ts";

// ── Event / Response types ──────────────────────────────────────────────────

/** An incoming tool call from the language model. */
export type ToolCallEvent = {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly callId?: string;
};

/** The response to return to the language model as a tool result. */
export type ToolCallResponse = {
  readonly content: unknown;
  readonly isError?: boolean;
};

// ── Response helpers ────────────────────────────────────────────────────────

/** Convert a Result into the tool-response wire format. */
export const mapToToolResponse = (
  result: results.Result<unknown, Error>,
): ToolCallResponse => {
  if (results.isOk(result)) {
    return { content: result.value };
  }
  return { content: result.error.message, isError: true };
};

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Route a tool-call event to the matching bound trigger.
 * Returns `ToolCallResponse` — content is the serialisable result value
 * or the error message if the tool errored.
 */
export const routeToolCall = async (
  bound: BoundTriggers,
  event: ToolCallEvent,
): Promise<ToolCallResponse> => {
  const args = event.arguments;

  switch (event.name) {
    case "compose_post": {
      const input = args as appHandlers.ComposeInput;
      const result = await task.runTask(bound.composeTweet(input));
      return mapToToolResponse(result);
    }

    case "compose_post_all": {
      const input = args as appHandlers.ComposeAllInput;
      const result = await task.runTask(bound.composePostToAll(input));
      return mapToToolResponse(result);
    }

    case "translate_and_post": {
      const input = args as appHandlers.TranslateAndPostInput;
      const result = await task.runTask(bound.translateAndPost(input));
      return mapToToolResponse(result);
    }

    case "reply_to_post": {
      const input = args as appHandlers.ReplyInput;
      const result = await task.runTask(bound.reply(input));
      return mapToToolResponse(result);
    }

    case "post_thread": {
      const input = args as unknown as appHandlers.PostThreadInput;
      const result = await task.runTask(bound.postThread(input));
      return mapToToolResponse(result);
    }

    case "repost": {
      const input = args as appHandlers.RepostInput;
      const result = await task.runTask(bound.repost(input));
      return mapToToolResponse(result);
    }

    case "undo_repost": {
      const input = args as appHandlers.UndoRepostInput;
      const result = await task.runTask(bound.undoRepost(input));
      return mapToToolResponse(result);
    }

    case "quote_post": {
      const input = args as appHandlers.QuotePostInput;
      const result = await task.runTask(bound.quotePost(input));
      return mapToToolResponse(result);
    }

    case "search_posts": {
      const input = args as appHandlers.SearchPostsInput;
      const result = await task.runTask(bound.searchPosts(input));
      return mapToToolResponse(result);
    }

    case "search_posts_all": {
      const input = args as appHandlers.SearchPostsAllInput;
      const result = await task.runTask(bound.searchPostsAll(input));
      return mapToToolResponse(result);
    }

    case "get_post": {
      const input = args as appHandlers.GetPostInput;
      const result = await task.runTask(bound.getPost(input));
      return mapToToolResponse(result);
    }

    case "bookmark_post": {
      const input = args as appHandlers.BookmarkPostInput;
      const result = await task.runTask(bound.bookmarkPost(input));
      return mapToToolResponse(result);
    }

    case "remove_bookmark": {
      const input = args as appHandlers.RemoveBookmarkInput;
      const result = await task.runTask(bound.removeBookmark(input));
      return mapToToolResponse(result);
    }

    default:
      return { content: `Unknown tool: ${event.name}`, isError: true };
  }
};

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Produce a single-arg tool-call trigger from pre-bound handlers.
 * Pass the result to the agent loop — it never needs to see BoundTriggers.
 */
export const createToolCallTrigger = (
  bound: BoundTriggers,
): (event: ToolCallEvent) => Promise<ToolCallResponse> =>
(event) => routeToolCall(bound, event);

export type ToolCallTrigger = ReturnType<typeof createToolCallTrigger>;
