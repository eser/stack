// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/posts module definition — multi-platform social posting for the eser CLI.
 *
 * Registered as `eser posts <command>` in @eserstack/cli.
 *
 * @module
 */

import { Module } from "@eserstack/shell/module";

export const moduleDef: Module = new Module({
  description: "posts — compose and manage social media posts across platforms",
  modules: {
    compose: {
      description: "Publish a post to a platform",
      load: () => import("./adapters/cli/commands/compose.ts"),
    },
    reply: {
      description: "Reply to an existing post",
      load: () => import("./adapters/cli/commands/reply.ts"),
    },
    thread: {
      description: "Publish a thread of posts",
      load: () => import("./adapters/cli/commands/thread.ts"),
    },
    timeline: {
      description: "Fetch your timeline (use --unified for all platforms)",
      load: () => import("./adapters/cli/commands/timeline.ts"),
    },
    repost: {
      description: "Repost someone else's post without commentary",
      load: () => import("./adapters/cli/commands/repost.ts"),
    },
    quote: {
      description: "Quote post — share with your own commentary",
      load: () => import("./adapters/cli/commands/quote.ts"),
    },
    unrepost: {
      description: "Remove a repost",
      load: () => import("./adapters/cli/commands/unrepost.ts"),
    },
    search: {
      description: "Search for posts by keyword or hashtag",
      load: () => import("./adapters/cli/commands/search.ts"),
    },
    bookmark: {
      description: "Add a post to your bookmarks",
      load: () => import("./adapters/cli/commands/bookmark.ts"),
    },
    bookmarks: {
      description: "List your bookmarked posts",
      load: () => import("./adapters/cli/commands/bookmarks.ts"),
    },
    unbookmark: {
      description: "Remove a post from your bookmarks",
      load: () => import("./adapters/cli/commands/unbookmark.ts"),
    },
    login: {
      description: "Authenticate with a social platform",
      load: () => import("./adapters/cli/commands/login.ts"),
    },
    logout: {
      description: "Clear saved credentials for a platform",
      load: () => import("./adapters/cli/commands/logout.ts"),
    },
    status: {
      description: "Show configured platforms and their auth state",
      load: () => import("./adapters/cli/commands/status.ts"),
    },
    usage: {
      description: "Show API usage statistics for a platform",
      load: () => import("./adapters/cli/commands/usage.ts"),
    },
  },
});
