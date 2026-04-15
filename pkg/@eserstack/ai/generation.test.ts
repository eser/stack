// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import type * as types from "./types.ts";
import * as generationModule from "./generation.ts";

describe("text helper", () => {
  it("should concatenate all text blocks", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "text", text: "Hello " },
        { kind: "text", text: "world!" },
      ],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      modelId: "test-model",
    };

    assertEquals(generationModule.text(result), "Hello world!");
  });

  it("should skip non-text blocks", () => {
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

    assertEquals(generationModule.text(result), "Result: done");
  });

  it("should return empty string when no text blocks", () => {
    const result: generationModule.GenerateTextResult = {
      content: [
        { kind: "tool_call", toolCall: { id: "1", name: "fn", arguments: {} } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      modelId: "test-model",
    };

    assertEquals(generationModule.text(result), "");
  });
});

describe("toolCalls helper", () => {
  it("should extract all tool calls", () => {
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
    assertEquals(calls.length, 2);
    assertEquals(calls[0]?.name, "get_weather");
    assertEquals(calls[1]?.name, "get_time");
  });

  it("should return empty array when no tool calls", () => {
    const result: generationModule.GenerateTextResult = {
      content: [{ kind: "text", text: "No tools needed." }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      modelId: "test-model",
    };

    assertEquals(generationModule.toolCalls(result).length, 0);
  });
});

describe("collectStream", () => {
  it("should collect stream events into a result", async () => {
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
    assertEquals(generationModule.text(result), "Hello world!");
    assertEquals(result.stopReason, "end_turn");
    assertEquals(result.usage.inputTokens, 10);
    assertEquals(result.modelId, "test-model");
  });

  it("should collect tool calls from stream", async () => {
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
    assertEquals(calls.length, 1);
    assertEquals(calls[0]?.name, "get_weather");
  });

  it("should throw on error events", async () => {
    async function* mockStream(): AsyncIterable<generationModule.StreamEvent> {
      yield { kind: "content_delta", textDelta: "partial" };
      yield { kind: "error", error: new Error("stream failed") };
    }

    await assertRejects(
      () => generationModule.collectStream(mockStream()),
      Error,
      "stream failed",
    );
  });
});
