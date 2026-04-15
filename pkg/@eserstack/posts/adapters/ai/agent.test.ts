// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import * as taskMod from "@eserstack/functions/task";
import * as ai from "@eserstack/ai/mod";
import type { BoundTriggers } from "../../application/wiring.ts";
import { createTestPost } from "../../application/testing.ts";
import { runPostsAgent } from "./agent.ts";

// ── Mock helpers ──────────────────────────────────────────────────────────────

const ZERO_USAGE: ai.Usage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

function textResult(text: string): ai.GenerateTextResult {
  return {
    content: [{ kind: "text", text }],
    stopReason: "end_turn",
    usage: ZERO_USAGE,
    modelId: "mock-model",
  };
}

function toolCallResult(
  id: string,
  name: string,
  args: Record<string, unknown>,
): ai.GenerateTextResult {
  return {
    content: [{ kind: "tool_call", toolCall: { id, name, arguments: args } }],
    stopReason: "tool_use",
    usage: ZERO_USAGE,
    modelId: "mock-model",
  };
}

function createMockModel(
  responses: Array<results.Result<ai.GenerateTextResult, ai.AiError>>,
): ai.LanguageModel {
  let call = 0;
  return {
    capabilities: ["text_generation", "tool_calling"],
    provider: "mock",
    modelId: "mock-model",
    generateText: (
      _opts,
    ): Promise<results.Result<ai.GenerateTextResult, ai.AiError>> => {
      const response = responses[call++];
      if (response === undefined) {
        return Promise.resolve(
          results.fail(new ai.AiError("No more mock responses")),
        );
      }
      return Promise.resolve(response);
    },
    streamText: (_opts) => {
      async function* empty() {}
      return empty();
    },
    close: async () => {},
    getRawClient: () => null,
  };
}

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

// ── Tests ─────────────────────────────────────────────────────────────────────

bdd.describe("runPostsAgent", () => {
  bdd.it(
    "returns ok with final text when model produces text-only on first turn",
    async () => {
      const model = createMockModel([
        results.ok(textResult("I can help you with that!")),
      ]);
      const bound = createMockBound();

      const result = await runPostsAgent("List my options", { model, bound });

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(
        results.isOk(result) ? result.value : "",
        "I can help you with that!",
      );
    },
  );

  bdd.it(
    "performs a tool call and returns final text on second turn",
    async () => {
      const testPost = createTestPost({ text: "Hello from agent" });
      let composeCalled = false;

      const model = createMockModel([
        results.ok(
          toolCallResult("call-1", "compose_post", {
            text: "Hello from agent",
          }),
        ),
        results.ok(textResult("Post published successfully.")),
      ]);

      const bound = createMockBound({
        composeTweet: (_i) => {
          composeCalled = true;
          return taskMod.succeed(testPost);
        },
      });

      const result = await runPostsAgent("Post Hello from agent", {
        model,
        bound,
      });

      assert.assertEquals(
        composeCalled,
        true,
        "composeTweet should have been called",
      );
      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(
        results.isOk(result) ? result.value : "",
        "Post published successfully.",
      );
    },
  );

  bdd.it("returns fail when model generation returns an error", async () => {
    const aiError = new ai.AiError("Model unavailable", { statusCode: 503 });
    const model = createMockModel([results.fail(aiError)]);
    const bound = createMockBound();

    const result = await runPostsAgent("Do something", { model, bound });

    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertEquals(result.error, aiError);
    }
  });

  bdd.it("returns fail when maxTurns is exceeded", async () => {
    // Model always returns a tool call — never a text-only turn
    const toolCallResponses = Array.from(
      { length: 5 },
      (_, i) =>
        results.ok(
          toolCallResult(`call-${i}`, "compose_post", { text: `Turn ${i}` }),
        ),
    );
    const model = createMockModel(toolCallResponses);
    const bound = createMockBound();

    const result = await runPostsAgent("Keep posting", {
      model,
      bound,
      maxTurns: 3,
    });

    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertStringIncludes(result.error.message, "3 turns");
    }
  });

  bdd.it(
    "tool failure is fed back as tool-result message, not a thrown error",
    async () => {
      let secondCallMessages: readonly unknown[] = [];

      const model: ai.LanguageModel = {
        capabilities: ["text_generation", "tool_calling"],
        provider: "mock",
        modelId: "mock-model",
        generateText: (
          opts,
        ): Promise<results.Result<ai.GenerateTextResult, ai.AiError>> => {
          if (opts.messages.length === 1) {
            return Promise.resolve(
              results.ok(
                toolCallResult("call-err", "compose_post", {
                  text: "This will fail",
                }),
              ),
            );
          }
          secondCallMessages = opts.messages;
          return Promise.resolve(
            results.ok(textResult("Handled the error gracefully.")),
          );
        },
        streamText: (_opts) => {
          async function* empty() {}
          return empty();
        },
        close: async () => {},
        getRawClient: () => null,
      };

      const bound = createMockBound({
        composeTweet: (_i) => taskMod.failTask(new Error("Platform down")),
      });

      const result = await runPostsAgent("Post this", { model, bound });

      assert.assertEquals(results.isOk(result), true);

      const toolResultMessage = (
        secondCallMessages as Array<{ role: string; content: unknown[] }>
      ).find((m) => m.role === "tool");
      assert.assertExists(
        toolResultMessage,
        "A tool-result message should be in the conversation",
      );
    },
  );

  bdd.it("respects custom system prompt", async () => {
    let capturedSystem: string | undefined;

    const model: ai.LanguageModel = {
      capabilities: ["text_generation", "tool_calling"],
      provider: "mock",
      modelId: "mock-model",
      generateText: (
        opts,
      ): Promise<results.Result<ai.GenerateTextResult, ai.AiError>> => {
        capturedSystem = opts.system;
        return Promise.resolve(results.ok(textResult("OK")));
      },
      streamText: (_opts) => {
        async function* empty() {}
        return empty();
      },
      close: async () => {},
      getRawClient: () => null,
    };

    const bound = createMockBound();
    await runPostsAgent("Do something", {
      model,
      bound,
      system: "You are a social media assistant.",
    });

    assert.assertEquals(capturedSystem, "You are a social media assistant.");
  });
});
