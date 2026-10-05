// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AI tool-call trigger adapters for @eserstack/posts.
 *
 * `routeToolCall(bound, event)` dispatches a model tool call to the matching
 * bound trigger and returns a `ToolCallResponse` ready to feed back into the
 * conversation. The arguments are model output, which is untrusted input, so
 * they are checked against the tool's JSON Schema parameters from
 * tool-definitions.ts first (tool-arguments.ts). A call whose arguments do not
 * match runs no handler and comes back as an error response that names each
 * bad argument.
 *
 * A failed tool comes back with its error message as the content, except
 * the two partial failures: a cross-post that failed on some platforms and a
 * thread that stopped partway come back as objects that list the posts that
 * were published and what failed, so the model does not publish them again.
 *
 * `createToolCallTrigger(bound)` wraps `routeToolCall` into a single-arg
 * function for use in the agent loop.
 *
 * @module
 */

import type * as ai from "@eserstack/ai/mod";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as fanOutPartialError from "../../application/fan-out-partial-error.ts";
import type * as appHandlers from "../../application/handlers.ts";
import * as threadPostError from "../../application/thread-post-error.ts";
import type { BoundTriggers } from "../../application/wiring.ts";
import type { Post } from "../../domain/entities/post.ts";
import type { Platform } from "../../domain/values/platform.ts";
import * as toolArguments from "./tool-arguments.ts";
import * as toolDefinitions from "./tool-definitions.ts";

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

/**
 * The error content of a cross-post (compose_post_all) that failed on at
 * least one platform. The posts in `posted` are public and stay up.
 */
export type FanOutPartialContent = {
  /** What happened, naming the platforms that published and failed. */
  readonly error: string;
  /** The posts that were published, one per platform that succeeded. */
  readonly posted: readonly Post[];
  /** Each platform that failed, with its error message. */
  readonly failed: ReadonlyArray<{
    readonly platform: Platform;
    readonly error: string;
  }>;
};

/**
 * The error content of a thread (post_thread) that stopped partway. The posts
 * in `posted` are public and stay up.
 */
export type ThreadPartialContent = {
  /** What happened: how many posts went out and where the thread stopped. */
  readonly error: string;
  /** The posts that were published, in thread order; empty when none were. */
  readonly posted: readonly Post[];
  /** The zero-based index of the post that failed; later ones were not sent. */
  readonly failedIndex: number;
  /** Why the post at `failedIndex` failed. */
  readonly cause: string;
};

// ── Response helpers ────────────────────────────────────────────────────────

/**
 * The tool-result content for a failure: the partial outcome for the two
 * partial errors, the error message for every other error.
 */
const failureContent = (
  error: Error,
): FanOutPartialContent | ThreadPartialContent | string => {
  if (error instanceof fanOutPartialError.FanOutPartialError) {
    return {
      error: error.message,
      posted: error.posted,
      failed: error.failed.map((failure) => ({
        platform: failure.platform,
        error: failure.error.message,
      })),
    };
  }

  if (error instanceof threadPostError.ThreadPartialError) {
    return {
      error: error.message,
      posted: error.postedTweets,
      failedIndex: error.failedIndex,
      cause: error.failureCause.message,
    };
  }

  return error.message;
};

/**
 * Convert a Result into the tool-response wire format.
 *
 * A success carries its value as the content, and `null` for a tool that has
 * no result value (repost, undo_repost, bookmark_post, remove_bookmark):
 * JSON.stringify turns undefined into undefined instead of a string, and the
 * OpenAI chat API rejects a tool message without content. A failure has
 * `isError` set; its content is a `FanOutPartialContent` for a
 * FanOutPartialError, a `ThreadPartialContent` for a ThreadPartialError, and
 * the error message for any other error.
 */
export const mapToToolResponse = (
  result: results.Result<unknown, Error>,
): ToolCallResponse => {
  if (results.isOk(result)) {
    return { content: result.value === undefined ? null : result.value };
  }
  return { content: failureContent(result.error), isError: true };
};

// ── Dispatch ────────────────────────────────────────────────────────────────

/** The post tools by name, so each call is checked against its own schema. */
const definitionsByName: ReadonlyMap<string, ai.ToolDefinition> = new Map(
  toolDefinitions.postToolDefinitions.map((definition) => [
    definition.name,
    definition,
  ]),
);

/** The schema of a tool that declares no parameters: an empty object. */
const NO_PARAMETERS: toolArguments.ToolSchema = {
  type: "object",
  properties: {},
};

/**
 * Route a tool-call event to the matching bound trigger.
 *
 * The arguments are checked against the tool's parameter schema first; when
 * they do not match, no handler runs and the response is an error that names
 * each bad argument. Otherwise the response comes from `mapToToolResponse`:
 * the serializable result value, or the failure content when the tool failed.
 */
export const routeToolCall = async (
  bound: BoundTriggers,
  event: ToolCallEvent,
): Promise<ToolCallResponse> => {
  const definition = definitionsByName.get(event.name);
  if (definition === undefined) {
    return {
      content: `Unknown tool: ${event.name}. The available tools are ${
        Array.from(definitionsByName.keys()).join(", ")
      }.`,
      isError: true,
    };
  }

  // tool-definitions.ts writes every parameters object in the ToolSchema
  // subset; tool-arguments.test.ts fails on a keyword outside it.
  const schema =
    (definition.parameters ?? NO_PARAMETERS) as toolArguments.ToolSchema;
  const checked = toolArguments.validateToolArguments(schema, event.arguments);
  if (results.isFail(checked)) {
    return {
      content: toolArguments.describeArgumentIssues(event.name, checked.error),
      isError: true,
    };
  }

  // The schema check above narrows the arguments to the handler input types
  // below; each schema in tool-definitions.ts mirrors its input type.
  const args = checked.value;

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
      // Reached only when postToolDefinitions gains a tool without a case
      // here; the routing test in triggers.test.ts covers every definition.
      return {
        content:
          `${event.name} is defined but has no route, so it did not run.`,
        isError: true,
      };
  }
};

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Produce a single-arg tool-call trigger from pre-bound handlers.
 * Pass the result to the agent loop; it never needs to see BoundTriggers.
 */
export const createToolCallTrigger = (
  bound: BoundTriggers,
): (event: ToolCallEvent) => Promise<ToolCallResponse> =>
(event) => routeToolCall(bound, event);

export type ToolCallTrigger = ReturnType<typeof createToolCallTrigger>;
