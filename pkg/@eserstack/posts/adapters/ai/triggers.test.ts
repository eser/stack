// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as taskMod from "@eserstack/functions/task";
import * as fanOutPartialError from "../../application/fan-out-partial-error.ts";
import * as testing from "../../application/testing.ts";
import * as threadPostError from "../../application/thread-post-error.ts";
import type { BoundTriggers } from "../../application/wiring.ts";
import * as toolDefinitions from "./tool-definitions.ts";
import * as triggers from "./triggers.ts";

// ── Mock BoundTriggers ────────────────────────────────────────────────────────

function createMockBound(overrides?: Partial<BoundTriggers>): BoundTriggers {
  const testPost = testing.createTestPost();

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

/** Mock BoundTriggers that record the name of every trigger that runs. */
function createRecordingBound(ran: string[]): BoundTriggers {
  const recording = Object.entries(createMockBound()).map(([key, trigger]) => [
    key,
    // Each trigger takes its own input type; the wrapper only forwards it.
    (input: never) => {
      ran.push(key);
      return trigger(input);
    },
  ]);
  return Object.fromEntries(recording) as BoundTriggers;
}

// ── mapToToolResponse ─────────────────────────────────────────────────────────

bdd.describe("mapToToolResponse", () => {
  bdd.it("returns content from ok result with no isError flag", () => {
    const result = results.ok({ id: "123", text: "hello" });
    const response = triggers.mapToToolResponse(result);
    assert.assertEquals(response.content, { id: "123", text: "hello" });
    assert.assertEquals(response.isError, undefined);
  });

  bdd.it(
    "returns error message string with isError: true for fail result",
    () => {
      const result = results.fail(new Error("API failed"));
      const response = triggers.mapToToolResponse(result);
      assert.assertEquals(response.content, "API failed");
      assert.assertEquals(response.isError, true);
    },
  );

  bdd.it(
    "lists the posted posts and each failed platform for a FanOutPartialError",
    () => {
      const posted = testing.createTestPost({ platform: "twitter" });
      const error = new fanOutPartialError.FanOutPartialError({
        posted: [posted],
        failed: [{ platform: "bluesky", error: new Error("rate limited") }],
        totalPlatforms: 2,
      });

      const response = triggers.mapToToolResponse(results.fail(error));

      assert.assertEquals(response.isError, true);
      const expected: triggers.FanOutPartialContent = {
        error: error.message,
        posted: [posted],
        failed: [{ platform: "bluesky", error: "rate limited" }],
      };
      assert.assertEquals(response.content, expected);
    },
  );

  bdd.it(
    "lists the posted posts, the failed index and the cause for a ThreadPartialError",
    () => {
      const first = testing.createTestPost({ text: "one" });
      const error = new threadPostError.ThreadPartialError(
        [first],
        1,
        3,
        new Error("duplicate content"),
      );

      const response = triggers.mapToToolResponse(results.fail(error));

      assert.assertEquals(response.isError, true);
      const expected: triggers.ThreadPartialContent = {
        error: error.message,
        posted: [first],
        failedIndex: 1,
        cause: "duplicate content",
      };
      assert.assertEquals(response.content, expected);
    },
  );

  bdd.it("keeps the partial outcome when the agent serializes it", () => {
    const posted = testing.createTestPost({ platform: "twitter" });
    const error = new fanOutPartialError.FanOutPartialError({
      posted: [posted],
      failed: [{ platform: "bluesky", error: new Error("rate limited") }],
      totalPlatforms: 2,
    });

    // runPostsAgent sends JSON.stringify(content) to the model.
    const sent = JSON.parse(
      JSON.stringify(triggers.mapToToolResponse(results.fail(error)).content),
    );

    assert.assertEquals(sent.posted[0].id, posted.id);
    assert.assertEquals(sent.failed, [
      { platform: "bluesky", error: "rate limited" },
    ]);
  });
});

// ── routeToolCall ─────────────────────────────────────────────────────────────

bdd.describe("routeToolCall", () => {
  bdd.it("routes compose_post to bound.composeTweet", async () => {
    const testPost = testing.createTestPost({ text: "Hello world" });
    const bound = createMockBound({
      composeTweet: (_i) => taskMod.succeed(testPost),
    });

    const response = await triggers.routeToolCall(bound, {
      name: "compose_post",
      arguments: { text: "Hello world" },
    });

    assert.assertEquals(response.content, testPost);
    assert.assertEquals(response.isError, undefined);
  });

  bdd.it("routes compose_post_all to bound.composePostToAll", async () => {
    const posts = [
      testing.createTestPost(),
      testing.createTestPost({ platform: "bluesky" }),
    ];
    const bound = createMockBound({
      composePostToAll: (_i) => taskMod.succeed(posts),
    });

    const response = await triggers.routeToolCall(bound, {
      name: "compose_post_all",
      arguments: { text: "Cross-platform post" },
    });

    assert.assertEquals(response.content, posts);
  });

  bdd.it("routes search_posts and returns post array", async () => {
    const posts = [testing.createTestPost({ text: "search result" })];
    const bound = createMockBound({
      searchPosts: (_i) => taskMod.succeed(posts),
    });

    const response = await triggers.routeToolCall(bound, {
      name: "search_posts",
      arguments: { query: "typescript", platform: "twitter" },
    });

    assert.assertEquals(response.content, posts);
  });

  bdd.it("routes repost and returns null content on success", async () => {
    const bound = createMockBound({
      repost: (_i) => taskMod.succeed(undefined),
    });

    const response = await triggers.routeToolCall(bound, {
      name: "repost",
      arguments: { id: "1234567890", platform: "twitter" },
    });

    assert.assertEquals(response.content, null);
    assert.assertEquals(response.isError, undefined);
    // The agent sends JSON.stringify(content); undefined would send no text.
    assert.assertEquals(JSON.stringify(response.content), "null");
  });

  bdd.it("propagates task failure as isError response", async () => {
    const bound = createMockBound({
      composeTweet: (_i) => taskMod.failTask(new Error("Rate limit")),
    });

    const response = await triggers.routeToolCall(bound, {
      name: "compose_post",
      arguments: { text: "Hello" },
    });

    assert.assertEquals(response.content, "Rate limit");
    assert.assertEquals(response.isError, true);
  });

  bdd.it(
    "returns the partial outcome when compose_post_all fails on a platform",
    async () => {
      const posted = testing.createTestPost({ platform: "twitter" });
      const bound = createMockBound({
        composePostToAll: (_i) =>
          taskMod.failTask(
            new fanOutPartialError.FanOutPartialError({
              posted: [posted],
              failed: [{ platform: "bluesky", error: new Error("down") }],
              totalPlatforms: 2,
            }),
          ),
      });

      const response = await triggers.routeToolCall(bound, {
        name: "compose_post_all",
        arguments: { text: "Hello" },
      });

      assert.assertEquals(response.isError, true);
      const content = response.content as triggers.FanOutPartialContent;
      assert.assertEquals(content.posted, [posted]);
      assert.assertEquals(content.failed, [
        { platform: "bluesky", error: "down" },
      ]);
    },
  );

  bdd.it("returns isError response for unknown tool name", async () => {
    const bound = createMockBound();

    const response = await triggers.routeToolCall(bound, {
      name: "nonexistent_tool",
      arguments: {},
    });

    assert.assertEquals(response.isError, true);
    assert.assertStringIncludes(
      response.content as string,
      "Unknown tool: nonexistent_tool",
    );
  });

  const validCalls: ReadonlyArray<triggers.ToolCallEvent> = [
    { name: "compose_post", arguments: { text: "Hello" } },
    { name: "compose_post_all", arguments: { text: "Hello" } },
    {
      name: "translate_and_post",
      arguments: { text: "Merhaba", from: "tr", to: "en" },
    },
    {
      name: "reply_to_post",
      arguments: { text: "Hi", inReplyToId: "1234567890", platform: "twitter" },
    },
    { name: "post_thread", arguments: { texts: ["one", "two"] } },
    { name: "repost", arguments: { id: "1234567890", platform: "twitter" } },
    {
      name: "undo_repost",
      arguments: { id: "1234567890", platform: "twitter" },
    },
    {
      name: "quote_post",
      arguments: {
        text: "Look",
        quotedPostId: "at://did:plc:abc/app.bsky.feed.post/3k",
        platform: "bluesky",
      },
    },
    {
      name: "search_posts",
      arguments: { query: "deno", platform: "bluesky", maxResults: 5 },
    },
    { name: "search_posts_all", arguments: { query: "deno" } },
    { name: "get_post", arguments: { id: "1234567890", platform: "twitter" } },
    {
      name: "bookmark_post",
      arguments: { id: "1234567890", platform: "twitter" },
    },
    {
      name: "remove_bookmark",
      arguments: { id: "1234567890", platform: "twitter" },
    },
  ];

  bdd.it("routes every defined tool when its arguments are valid", async () => {
    const bound = createMockBound();
    for (const event of validCalls) {
      // Each call runs on its own; sequential keeps a failure tied to its tool.
      // oxlint-disable-next-line no-await-in-loop
      const response = await triggers.routeToolCall(bound, event);
      assert.assertEquals(response.isError, undefined, event.name);
    }
    assert.assertEquals(
      new Set(validCalls.map((event) => event.name)),
      new Set(toolDefinitions.postToolDefinitions.map((d) => d.name)),
    );
  });
});

// ── routeToolCall argument validation ─────────────────────────────────────────

bdd.describe("routeToolCall argument validation", () => {
  const invalidCalls = [
    {
      name: "a missing field",
      event: { name: "compose_post", arguments: { platform: "bluesky" } },
      expected: 'argument "text" is required',
    },
    {
      name: "a wrong platform",
      event: {
        name: "repost",
        arguments: { id: "1234567890", platform: "mastodon" },
      },
      expected:
        'argument "platform" must be one of "twitter", "bluesky"; got "mastodon"',
    },
    {
      name: "a wrong type",
      event: {
        name: "post_thread",
        arguments: { texts: "first post, second post" },
      },
      expected:
        'argument "texts" must be an array; got "first post, second post"',
    },
  ];

  for (const { name, event, expected } of invalidCalls) {
    bdd.it(`rejects ${name} without running any handler`, async () => {
      const ran: string[] = [];
      const bound = createRecordingBound(ran);

      const response = await triggers.routeToolCall(bound, event);

      assert.assertEquals(response.isError, true);
      assert.assertStringIncludes(response.content as string, expected);
      assert.assertStringIncludes(
        response.content as string,
        `${event.name} did not run`,
      );
      assert.assertEquals(ran, []);
    });
  }
});

// ── createToolCallTrigger ─────────────────────────────────────────────────────

bdd.describe("createToolCallTrigger", () => {
  bdd.it(
    "returns a single-arg function that dispatches correctly",
    async () => {
      const testPost = testing.createTestPost();
      const bound = createMockBound({
        getPost: (_i) => taskMod.succeed(testPost),
      });
      const trigger = triggers.createToolCallTrigger(bound);

      const response = await trigger({
        name: "get_post",
        arguments: { id: "1234567890", platform: "twitter" },
        callId: "call-001",
      });

      assert.assertEquals(response.content, testPost);
    },
  );
});
