// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import type * as types from "./types.ts";
import * as generationModule from "./generation.ts";

bdd.describe("text helper", () => {
  bdd.it("should concatenate all text blocks", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "text", text: "Hello " },
        { kind: "text", text: "world!" },
      ],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      modelId: "test-model",
    };

    assert.assertEquals(generationModule.text(result), "Hello world!");
  });

  bdd.it("should skip non-text blocks", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "text", text: "Result: " },
        { kind: "tool_call", toolCall: { id: "1", name: "fn", arguments: {} } },
        { kind: "text", text: "done" },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      modelId: "test-model",
    };

    assert.assertEquals(generationModule.text(result), "Result: done");
  });

  bdd.it("should return empty string when no text blocks", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "tool_call", toolCall: { id: "1", name: "fn", arguments: {} } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      modelId: "test-model",
    };

    assert.assertEquals(generationModule.text(result), "");
  });
});

bdd.describe("toolCalls helper", () => {
  bdd.it("should extract all tool calls", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "text", text: "Let me check." },
        {
          kind: "tool_call",
          toolCall: {
            id: "1",
            name: "get_weather",
            arguments: { city: "Istanbul" },
          },
        },
        {
          kind: "tool_call",
          toolCall: { id: "2", name: "get_time", arguments: { tz: "UTC" } },
        },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      modelId: "test-model",
    };

    const calls = generationModule.toolCalls(result);
    assert.assertEquals(calls.length, 2);
    assert.assertEquals(calls[0]?.name, "get_weather");
    assert.assertEquals(calls[1]?.name, "get_time");
  });

  bdd.it("should return empty array when no tool calls", () => {
    const result: generationModule.GenerateTextResult = {
      content: [{ kind: "text", text: "No tools needed." }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      modelId: "test-model",
    };

    assert.assertEquals(generationModule.toolCalls(result).length, 0);
  });
});

bdd.describe("collectStream", () => {
  bdd.it("should collect stream events into a result", async () => {
    async function* mockStream(): AsyncIterable<generationModule.StreamEvent> {
      yield { kind: "content_delta", textDelta: "Hello " };
      yield { kind: "content_delta", textDelta: "world!" };
      yield {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    }

    const result = await generationModule.collectStream(
      mockStream(),
      "test-model",
    );
    assert.assertEquals(generationModule.text(result), "Hello world!");
    assert.assertEquals(result.stopReason, "end_turn");
    assert.assertEquals(result.usage.inputTokens, 10);
    assert.assertEquals(result.modelId, "test-model");
  });

  bdd.it("should collect tool calls from stream", async () => {
    const toolCall: types.ToolCall = {
      id: "1",
      name: "get_weather",
      arguments: { city: "Berlin" },
    };

    async function* mockStream(): AsyncIterable<generationModule.StreamEvent> {
      yield { kind: "tool_call_delta", toolCall };
      yield {
        kind: "message_done",
        stopReason: "tool_use",
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      };
    }

    const result = await generationModule.collectStream(mockStream());
    const calls = generationModule.toolCalls(result);
    assert.assertEquals(calls.length, 1);
    assert.assertEquals(calls[0]?.name, "get_weather");
  });

  bdd.it("should put thinking first and keep it out of the text", async () => {
    // Anthropic rejects a replayed assistant turn whose tool calls are not
    // preceded by their thinking, whatever order the events arrived in.
    async function* mockStream(): AsyncIterable<generationModule.StreamEvent> {
      yield { kind: "content_delta", textDelta: "Looking." };
      yield {
        kind: "tool_call_delta",
        toolCall: { id: "1", name: "get_weather", arguments: {} },
      };
      yield { kind: "thinking", thinking: { text: "plan", signature: "sig" } };
      yield {
        kind: "message_done",
        stopReason: "tool_use",
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      };
    }

    const result = await generationModule.collectStream(mockStream());

    assert.assertEquals(
      result.content.map((block) => block.kind),
      ["thinking", "text", "tool_call"],
    );
    assert.assertEquals(result.content[0], {
      kind: "thinking",
      thinking: { text: "plan", signature: "sig" },
    });
    assert.assertEquals(generationModule.text(result), "Looking.");
  });

  bdd.it("should throw on error events", async () => {
    async function* mockStream(): AsyncIterable<generationModule.StreamEvent> {
      yield { kind: "content_delta", textDelta: "partial" };
      yield { kind: "error", error: new Error("stream failed") };
    }

    await assert.assertRejects(
      () => generationModule.collectStream(mockStream()),
      Error,
      "stream failed",
    );
  });
});
