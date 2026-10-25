// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tool definitions for @eserstack/posts: 13 post-management operations as
 * AI-callable tools with JSON Schema parameters, ready to pass to
 * `LanguageModel.generateText({ tools })`.
 *
 * Each description is the tool's contract for the model: what the tool does,
 * whether it publishes publicly or only reads, which sibling tool fits better
 * for a related job, and what comes back on success and on failure. The
 * behavior they state comes from application/handlers.ts, the PostService and
 * the platform adapters; the text length limits come from the domain rules in
 * domain/values/char-limits.ts, and the error content of the two partial
 * failures from mapToToolResponse in triggers.ts.
 *
 * `routeToolCall` in triggers.ts checks every call against these parameter
 * schemas before a handler runs (tool-arguments.ts), so the schemas are the
 * enforced contract, not only a hint: write them in the keywords that
 * tool-arguments.ts supports.
 *
 * @module
 */

import type * as ai from "@eserstack/ai/mod";
import * as defaults from "../../application/defaults.ts";
import type { SubscriptionTier } from "../../domain/entities/user.ts";
import * as charLimits from "../../domain/values/char-limits.ts";
import type { Platform } from "../../domain/values/platform.ts";

const charLimit = (
  platform: Platform,
  subscriptionTier: SubscriptionTier,
): number => charLimits.getCharacterLimit({ platform, subscriptionTier });

/** Post length limits, stated on every parameter the model writes text into. */
const TEXT_LIMITS =
  `Twitter/X allows ${charLimit("twitter", "free")} ` +
  `characters (${charLimit("twitter", "premium_plus")} on Premium+ and ` +
  `Business accounts) and Bluesky ${charLimit("bluesky", "free")}.`;

/** The fields of a post as the tool results serialize it. */
const POST_FIELDS = "id, text, authorHandle, createdAt, platform";

/** How the triggers report a failed operation back to the model. */
const ERROR_RESULT =
  "A failure comes back as an error result with the error message as its content";

const PLATFORM_SCHEMA = {
  type: "string",
  enum: ["twitter", "bluesky"],
  description: "Target platform: twitter (Twitter/X) or bluesky.",
} as const;

/**
 * A Twitter/X post ID is a decimal snowflake of at most 19 digits; a Bluesky
 * post ID is its at:// URI. The pattern keeps anything else, such as a path
 * like "../tweets/123", out of the API request URLs.
 */
const POST_ID_PATTERN = "^(?:[0-9]{1,19}|at://\\S+)$";

const postIdSchema = (purpose: string) => ({
  type: "string",
  pattern: POST_ID_PATTERN,
  description: `${purpose}: the numeric ID on Twitter/X, the at:// URI on Bluesky.`,
});

/** The compose_post tool: publish one post on one platform. */
export const composeTweetDefinition: ai.ToolDefinition = {
  name: "compose_post",
  description:
    "Publishes a new post on one platform, or on the first configured platform when platform is omitted. " +
    "The post is public at once and no tool here can delete it; use compose_post_all to publish on every platform, reply_to_post to answer a post, or post_thread for a chain of posts. " +
    `Returns the created post as JSON (${POST_FIELDS}). ` +
    `${ERROR_RESULT}.`,
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description: `Post text. ${TEXT_LIMITS}`,
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text"],
  },
};

/** The compose_post_all tool: publish the same post on every configured platform. */
export const composePostToAllDefinition: ai.ToolDefinition = {
  name: "compose_post_all",
  description:
    "Publishes the same text on every configured platform, one platform after another. " +
    "Each post is public at once and no tool here can delete it; use compose_post to publish on one platform. " +
    "Returns an array of the created posts as JSON, one per platform. " +
    "If any platform fails, the result is an error whose content is a JSON object with error (a summary), posted (the posts that went out; they stay published) and failed (each failed platform with its error message), so retry only the failed platforms with compose_post instead of calling this tool again; when no platform is configured, the error content is the message alone.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description: `Post text; it must fit every platform. ${TEXT_LIMITS}`,
      },
    },
    required: ["text"],
  },
};

/** The translate_and_post tool: translate a text, then publish it. */
export const translateAndPostDefinition: ai.ToolDefinition = {
  name: "translate_and_post",
  description:
    "Translates the text with the configured translator, then publishes the translation as a new post on one platform, or on the first configured platform when platform is omitted. " +
    "The post is public at once and no tool here can delete it; use compose_post when the text is already in the target language. " +
    "Returns the created post as JSON, with the translation as its text. " +
    `${ERROR_RESULT}; when the translation fails, nothing is published.`,
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description: `Text to translate, in the source language. The translation must fit the platform limit: ${TEXT_LIMITS}`,
      },
      from: {
        type: "string",
        minLength: 1,
        description: "Source language as a BCP 47 code, such as en or tr.",
      },
      to: {
        type: "string",
        minLength: 1,
        description: "Target language as a BCP 47 code, such as es or ja.",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "from", "to"],
  },
};

/** The reply_to_post tool: publish a reply to an existing post. */
export const replyDefinition: ai.ToolDefinition = {
  name: "reply_to_post",
  description:
    "Publishes a reply to an existing post, after fetching that post on the given platform to link the reply to it. " +
    "The reply is public at once and no tool here can delete it; use quote_post to share the post with your own commentary, or get_post to read it first. " +
    "Returns the created reply as JSON, with inReplyToId set to the original post's ID. " +
    `${ERROR_RESULT}, such as an original post that cannot be fetched.`,
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description: `Reply text. ${TEXT_LIMITS}`,
      },
      inReplyToId: postIdSchema("ID of the post to reply to"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "inReplyToId", "platform"],
  },
};

/** The post_thread tool: publish a chain of posts. */
export const postThreadDefinition: ai.ToolDefinition = {
  name: "post_thread",
  description:
    "Publishes a thread of at least 2 posts on one platform, or on the first configured platform when platform is omitted, with each post replying to the one before it. " +
    "The posts are public at once and no tool here can delete them; use compose_post for a single post. " +
    "Returns an array of the created posts as JSON, in thread order. " +
    "If a post fails, the result is an error whose content is a JSON object with error (a summary), posted (the posts that went out, in order; they stay published), failedIndex (the zero-based index of the post that failed; later posts were not sent) and cause (why it failed), so do not resend the whole thread; any other failure comes back as an error with the error message as its content.",
  parameters: {
    type: "object",
    properties: {
      texts: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 2,
        description: `Post texts in thread order, at least 2. Each text must fit the platform limit on its own: ${TEXT_LIMITS}`,
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["texts"],
  },
};

/** The repost tool: share an existing post without commentary. */
export const repostDefinition: ai.ToolDefinition = {
  name: "repost",
  description:
    "Reposts an existing post to your followers without adding text, the same as a retweet on Twitter/X. " +
    "The repost is public at once; use undo_repost to remove it, or quote_post to add your own commentary. " +
    "Returns null on success. " +
    `${ERROR_RESULT}.`,
  parameters: {
    type: "object",
    properties: {
      id: postIdSchema("ID of the post to repost"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

/** The undo_repost tool: remove a repost. */
export const undoRepostDefinition: ai.ToolDefinition = {
  name: "undo_repost",
  description:
    "Removes a repost you made, taking it off your public profile; the original post stays as it is. " +
    "Use repost to share the post again. " +
    "Returns null on success. " +
    `${ERROR_RESULT}; on Bluesky only your 100 most recent reposts are checked, and an older one comes back as not found.`,
  parameters: {
    type: "object",
    properties: {
      id: postIdSchema("ID of the original post whose repost to remove"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

/** The quote_post tool: publish a post that embeds another post. */
export const quotePostDefinition: ai.ToolDefinition = {
  name: "quote_post",
  description:
    "Publishes a new post that embeds an existing post under your commentary. " +
    "The post is public at once and no tool here can delete it; use repost to share without commentary, or reply_to_post to answer inside the original conversation. " +
    "Returns the created post as JSON, with a referencedPosts entry of type quoted. " +
    `${ERROR_RESULT}, such as a quoted post that cannot be found.`,
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description: `Commentary text for the quote. ${TEXT_LIMITS}`,
      },
      quotedPostId: postIdSchema("ID of the post to quote"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "quotedPostId", "platform"],
  },
};

/** The search_posts tool: search one platform. */
export const searchPostsDefinition: ai.ToolDefinition = {
  name: "search_posts",
  description:
    "Searches one platform for posts matching a query, recent posts only on Twitter/X; it is read-only. " +
    "Use search_posts_all to search every configured platform at once, or get_post when you already have a post ID. " +
    `Returns an array of matching posts as JSON (${POST_FIELDS}), empty when nothing matches. ` +
    `${ERROR_RESULT}.`,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, description: "Search query." },
      platform: PLATFORM_SCHEMA,
      maxResults: {
        type: "integer",
        minimum: 1,
        description:
          "Maximum number of posts to return. When omitted, the platform's default applies.",
      },
    },
    required: ["query", "platform"],
  },
};

/** The search_posts_all tool: search every configured platform. */
export const searchPostsAllDefinition: ai.ToolDefinition = {
  name: "search_posts_all",
  description:
    "Searches every configured platform for posts matching a query and merges the results, newest first; it is read-only. " +
    "A platform that fails is skipped without an error, so use search_posts on one platform to see why its results are missing. " +
    "Returns an array of matching posts as JSON, each with its platform field, and an empty array when nothing matches or every platform fails.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, description: "Search query." },
      maxResultsPerPlatform: {
        type: "integer",
        minimum: 1,
        description: `Maximum number of posts to collect from each platform. When omitted, ${defaults.DEFAULT_MAX_RESULTS_PER_PLATFORM} per platform.`,
      },
    },
    required: ["query"],
  },
};

/** The get_post tool: fetch one post by ID. */
export const getPostDefinition: ai.ToolDefinition = {
  name: "get_post",
  description:
    "Fetches one post by its ID from the given platform; it is read-only. " +
    "Use search_posts when you have keywords instead of an ID. " +
    `Returns the post as JSON (${POST_FIELDS}). ` +
    `${ERROR_RESULT}, such as an unknown ID.`,
  parameters: {
    type: "object",
    properties: {
      id: postIdSchema("ID of the post to fetch"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

/** The bookmark_post tool: bookmark a post on Twitter/X. */
export const bookmarkPostDefinition: ai.ToolDefinition = {
  name: "bookmark_post",
  description:
    "Adds a post to your bookmarks on Twitter/X; bookmarks are private, so nothing public changes. " +
    "Use remove_bookmark to undo it; on Bluesky, which has no bookmark API, this tool always returns an error. " +
    "Returns null on success. " +
    `${ERROR_RESULT}.`,
  parameters: {
    type: "object",
    properties: {
      id: postIdSchema("ID of the post to bookmark"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

/** The remove_bookmark tool: remove a bookmark on Twitter/X. */
export const removeBookmarkDefinition: ai.ToolDefinition = {
  name: "remove_bookmark",
  description:
    "Removes a post from your bookmarks on Twitter/X; bookmarks are private, so nothing public changes. " +
    "Use bookmark_post to add one; on Bluesky, which has no bookmark API, this tool always returns an error. " +
    "Returns null on success. " +
    `${ERROR_RESULT}.`,
  parameters: {
    type: "object",
    properties: {
      id: postIdSchema("ID of the bookmarked post"),
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

/** All 13 post-management tool definitions, ready to pass to `generateText`. */
export const postToolDefinitions: readonly ai.ToolDefinition[] = [
  composeTweetDefinition,
  composePostToAllDefinition,
  translateAndPostDefinition,
  replyDefinition,
  postThreadDefinition,
  repostDefinition,
  undoRepostDefinition,
  quotePostDefinition,
  searchPostsDefinition,
  searchPostsAllDefinition,
  getPostDefinition,
  bookmarkPostDefinition,
  removeBookmarkDefinition,
];
