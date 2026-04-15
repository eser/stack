// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as primitiveResults from "@eserstack/primitives/results";
import type * as generation from "../generation.ts";
import type * as errors from "../errors.ts";
import type * as model from "../model.ts";
import * as sourcesModule from "./sources.ts";

// =============================================================================
// Mock Model
// =============================================================================

const createMockStreamingModel = (
  events: readonly generation.StreamEvent[],
): model.LanguageModel => ({
  capabilities: ["text_generation", "streaming"],
  provider: "mock",
  modelId: "mock-v1",
  generateText(): Promise<
    primitiveResults.Result<generation.GenerateTextResult, errors.AiError>
  > {
    return Promise.resolve(
      primitiveResults.ok({
        content: [],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        modelId: "mock-v1",
      }),
    );
  },
  async *streamText(): AsyncIterable<generation.StreamEvent> {
    for (const event of events) {
      yield event;
    }
  },
  async close(): Promise<void> {},
  getRawClient(): unknown {
    return null;
  },
});

// =============================================================================
// Tests
// =============================================================================

describe("aiSource", () => {
  it("should create a Source<StreamEvent> from a model", async () => {
    const events: generation.StreamEvent[] = [
      { kind: "content_delta", textDelta: "Hello" },
      {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ];

    const mockModel = createMockStreamingModel(events);
    const source = sourcesModule.aiSource(mockModel, { messages: [] });

    assertEquals(source.name, "ai/mock/mock-v1");

    const chunks: generation.StreamEvent[] = [];
    const reader = source.readable.getReader();

    let readResult = await reader.read();
    while (readResult.done !== true) {
      chunks.push(readResult.value.data);
      readResult = await reader.read();
    }

    assertEquals(chunks.length, 2);
    assertEquals(chunks[0]?.kind, "content_delta");
    assertEquals(chunks[1]?.kind, "message_done");
  });
});

describe("aiTextSource", () => {
  it("should emit only text deltas", async () => {
    const events: generation.StreamEvent[] = [
      { kind: "content_delta", textDelta: "Hello " },
      { kind: "content_delta", textDelta: "world!" },
      {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ];

    const mockModel = createMockStreamingModel(events);
    const source = sourcesModule.aiTextSource(mockModel, { messages: [] });

    const texts: string[] = [];
    const reader = source.readable.getReader();

    let readResult = await reader.read();
    while (readResult.done !== true) {
      texts.push(readResult.value.data);
      readResult = await reader.read();
    }

    assertEquals(texts.length, 2);
    assertEquals(texts[0], "Hello ");
    assertEquals(texts[1], "world!");
  });
});

describe("streamEventSource", () => {
  it("should wrap an AsyncIterable as a Source", async () => {
    async function* events(): AsyncIterable<generation.StreamEvent> {
      yield { kind: "content_delta", textDelta: "test" };
    }

    const source = sourcesModule.streamEventSource(events(), "custom-name");
    assertEquals(source.name, "custom-name");

    const reader = source.readable.getReader();
    const result = await reader.read();
    assertEquals(result.value?.data.kind, "content_delta");
  });
});
