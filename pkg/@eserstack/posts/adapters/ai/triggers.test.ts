// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import * as taskMod from "@eserstack/functions/task";
import type { BoundTriggers } from "../../application/wiring.ts";
import { createTestPost } from "../../application/testing.ts";
import {
  createToolCallTrigger,
  mapToToolResponse,
  routeToolCall,
} from "./triggers.ts";

// ── Mock BoundTriggers ────────────────────────────────────────────────────────

function createMockBound(overrides?: Partial<BoundTriggers>): BoundTriggers {
  const testPost = createTestPost();

  return {
    composeTweet: (_i) => taskMod.succeed(testPost),
    composePostToAll: (_i) => taskMod.succeed([testPost]),
    translateAndPost: (_i) => taskMod.succeed(testPost),
    reply: (_i) => taskMod.succeed(testPost),
    postThread: (_i) => taskMod.succeed([testPost]),
    repost: (_i) => taskMod.succeed(undefined),
    undoRepost: (_i) => taskMod.succeed(undefined),
    quotePost: (_i) => taskMod.succeed(testPost),
    searchPosts: (_i) => taskMod.succeed([testPost]),
    searchPostsAll: (_i) => taskMod.succeed([testPost]),
    getPost: (_i) => taskMod.succeed(testPost),
    bookmarkPost: (_i) => taskMod.succeed(undefined),
    removeBookmark: (_i) => taskMod.succeed(undefined),
    getTimeline: (_i) => taskMod.succeed([testPost]),
    getUnifiedTimeline: (_i) => taskMod.succeed([testPost]),
    getBookmarks: (_i) => taskMod.succeed([testPost]),
    getUsage: (_i) =>
      taskMod.succeed({ appName: undefined, daily: [], totalCalls: 0 }),
    ...overrides,
  };
}

// ── mapToToolResponse ─────────────────────────────────────────────────────────

bdd.describe("mapToToolResponse", () => {
  bdd.it("returns content from ok result with no isError flag", () => {
    const result = results.ok({ id: "123", text: "hello" });
    const response = mapToToolResponse(result);
    assert.assertEquals(response.content, { id: "123", text: "hello" });
    assert.assertEquals(response.isError, undefined);
  });

  bdd.it(
    "returns error message string with isError: true for fail result",
    () => {
      const result = results.fail(new Error("API failed"));
      const response = mapToToolResponse(result);
      assert.assertEquals(response.content, "API failed");
      assert.assertEquals(response.isError, true);
    },
  );
});

// ── routeToolCall ─────────────────────────────────────────────────────────────

bdd.describe("routeToolCall", () => {
  bdd.it("routes compose_post to bound.composeTweet", async () => {
    const testPost = createTestPost({ text: "Hello world" });
    const bound = createMockBound({
      composeTweet: (_i) => taskMod.succeed(testPost),
    });

    const response = await routeToolCall(bound, {
      name: "compose_post",
      arguments: { text: "Hello world" },
    });

    assert.assertEquals(response.content, testPost);
    assert.assertEquals(response.isError, undefined);
  });

  bdd.it("routes compose_post_all to bound.composePostToAll", async () => {
    const posts = [createTestPost(), createTestPost({ platform: "bluesky" })];
    const bound = createMockBound({
      composePostToAll: (_i) => taskMod.succeed(posts),
    });

    const response = await routeToolCall(bound, {
      name: "compose_post_all",
      arguments: { text: "Cross-platform post" },
    });

    assert.assertEquals(response.content, posts);
  });

  bdd.it("routes search_posts and returns post array", async () => {
    const posts = [createTestPost({ text: "search result" })];
    const bound = createMockBound({
      searchPosts: (_i) => taskMod.succeed(posts),
    });

    const response = await routeToolCall(bound, {
      name: "search_posts",
      arguments: { query: "typescript", platform: "twitter" },
    });

    assert.assertEquals(response.content, posts);
  });

  bdd.it("routes repost and returns undefined content on success", async () => {
    const bound = createMockBound({
      repost: (_i) => taskMod.succeed(undefined),
    });

    const response = await routeToolCall(bound, {
      name: "repost",
      arguments: { id: "tweet-123", platform: "twitter" },
    });

    assert.assertEquals(response.content, undefined);
    assert.assertEquals(response.isError, undefined);
  });

  bdd.it("propagates task failure as isError response", async () => {
    const bound = createMockBound({
      composeTweet: (_i) => taskMod.failTask(new Error("Rate limit")),
    });

    const response = await routeToolCall(bound, {
      name: "compose_post",
      arguments: { text: "Hello" },
    });

    assert.assertEquals(response.content, "Rate limit");
    assert.assertEquals(response.isError, true);
  });

  bdd.it("returns isError response for unknown tool name", async () => {
    const bound = createMockBound();

    const response = await routeToolCall(bound, {
      name: "nonexistent_tool",
      arguments: {},
    });

    assert.assertEquals(response.isError, true);
    assert.assertStringIncludes(
      response.content as string,
      "Unknown tool: nonexistent_tool",
    );
  });
});

// ── createToolCallTrigger ─────────────────────────────────────────────────────

bdd.describe("createToolCallTrigger", () => {
  bdd.it(
    "returns a single-arg function that dispatches correctly",
    async () => {
      const testPost = createTestPost();
      const bound = createMockBound({
        getPost: (_i) => taskMod.succeed(testPost),
      });
      const trigger = createToolCallTrigger(bound);

      const response = await trigger({
        name: "get_post",
        arguments: { id: "test-post-1", platform: "twitter" },
        callId: "call-001",
      });

      assert.assertEquals(response.content, testPost);
    },
  );
});
