// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tool definitions for @eserstack/posts — exposes 13 post-management operations
 * as AI-callable tools with JSON Schema parameters.
 *
 * These definitions feed directly into `LanguageModel.generateText({ tools })`.
 * Each parameter schema constrains what the model can pass, which means the
 * adapter's validation in triggers.ts can rely on the model honoring the schema
 * rather than performing deep runtime validation.
 *
 * @module
 */

import type * as ai from "@eserstack/ai/mod";

const PLATFORM_SCHEMA = {
  type: "string",
  enum: ["twitter", "bluesky"],
  description: "Target social platform.",
} as const;

export const composeTweetDefinition: ai.ToolDefinition = {
  name: "compose_post",
  description:
    "Compose and publish a post (tweet) to a single social platform. If platform is omitted, the service decides.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Post body text." },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text"],
  },
};

export const composePostToAllDefinition: ai.ToolDefinition = {
  name: "compose_post_all",
  description:
    "Cross-post the same text to every authenticated platform simultaneously.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Post body text." },
    },
    required: ["text"],
  },
};

export const translateAndPostDefinition: ai.ToolDefinition = {
  name: "translate_and_post",
  description:
    "Translate text from one language to another, then publish the translated post to a social platform.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Original post text to translate." },
      from: {
        type: "string",
        description: "Source language code (e.g. 'en', 'tr').",
      },
      to: {
        type: "string",
        description: "Target language code (e.g. 'es', 'ja').",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "from", "to"],
  },
};

export const replyDefinition: ai.ToolDefinition = {
  name: "reply_to_post",
  description: "Reply to an existing post on a specific platform.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Reply text." },
      inReplyToId: {
        type: "string",
        description: "ID of the post being replied to.",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "inReplyToId", "platform"],
  },
};

export const postThreadDefinition: ai.ToolDefinition = {
  name: "post_thread",
  description:
    "Publish a thread (chain of connected posts) to a platform. Requires at least 2 posts.",
  parameters: {
    type: "object",
    properties: {
      texts: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        description: "Ordered list of post texts forming the thread.",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["texts"],
  },
};

export const repostDefinition: ai.ToolDefinition = {
  name: "repost",
  description: "Repost (retweet / rebluesky) an existing post.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID of the post to repost." },
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

export const undoRepostDefinition: ai.ToolDefinition = {
  name: "undo_repost",
  description: "Undo a previous repost.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "ID of the post whose repost should be undone.",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

export const quotePostDefinition: ai.ToolDefinition = {
  name: "quote_post",
  description: "Quote an existing post, adding commentary on top of it.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Commentary text for the quote." },
      quotedPostId: {
        type: "string",
        description: "ID of the post being quoted.",
      },
      platform: PLATFORM_SCHEMA,
    },
    required: ["text", "quotedPostId", "platform"],
  },
};

export const searchPostsDefinition: ai.ToolDefinition = {
  name: "search_posts",
  description: "Search for posts on a specific platform matching a query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query string." },
      platform: PLATFORM_SCHEMA,
      maxResults: {
        type: "integer",
        minimum: 1,
        description: "Maximum number of results to return.",
      },
    },
    required: ["query", "platform"],
  },
};

export const searchPostsAllDefinition: ai.ToolDefinition = {
  name: "search_posts_all",
  description:
    "Search for posts across all authenticated platforms, returning a unified result.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query string." },
      maxResultsPerPlatform: {
        type: "integer",
        minimum: 1,
        description: "Maximum results to collect from each platform.",
      },
    },
    required: ["query"],
  },
};

export const getPostDefinition: ai.ToolDefinition = {
  name: "get_post",
  description: "Retrieve a specific post by its ID from a platform.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Post ID to retrieve." },
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

export const bookmarkPostDefinition: ai.ToolDefinition = {
  name: "bookmark_post",
  description: "Bookmark a post on a platform.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID of the post to bookmark." },
      platform: PLATFORM_SCHEMA,
    },
    required: ["id", "platform"],
  },
};

export const removeBookmarkDefinition: ai.ToolDefinition = {
  name: "remove_bookmark",
  description: "Remove a bookmark from a previously bookmarked post.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID of the bookmarked post." },
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
