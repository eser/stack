// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
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

bdd.describe("aiSource", () => {
  bdd.it("should create a Source<StreamEvent> from a model", async () => {
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

    assert.assertEquals(source.name, "ai/mock/mock-v1");

    const chunks: generation.StreamEvent[] = [];
    for await (const chunk of source.readable) {
      chunks.push(chunk.data);
    }

    assert.assertEquals(chunks.length, 2);
    assert.assertEquals(chunks[0]?.kind, "content_delta");
    assert.assertEquals(chunks[1]?.kind, "message_done");
  });
});

bdd.describe("aiTextSource", () => {
  bdd.it("should emit only text deltas", async () => {
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
    for await (const chunk of source.readable) {
      texts.push(chunk.data);
    }

    assert.assertEquals(texts.length, 2);
    assert.assertEquals(texts[0], "Hello ");
    assert.assertEquals(texts[1], "world!");
  });

  bdd.it("fails the stream with the error of an error event", async () => {
    const failure = new Error("rate limited");
    const events: generation.StreamEvent[] = [
      { kind: "content_delta", textDelta: "Hel" },
      { kind: "error", error: failure },
      { kind: "content_delta", textDelta: "lo" },
    ];

    const mockModel = createMockStreamingModel(events);
    const source = sourcesModule.aiTextSource(mockModel, { messages: [] });

    const texts: string[] = [];
    const error = await assert.assertRejects(async () => {
      for await (const chunk of source.readable) {
        texts.push(chunk.data);
      }
    });

    assert.assertStrictEquals(error, failure);
    assert.assertEquals(texts, ["Hel"]);
  });
});

bdd.describe("streamEventSource", () => {
  bdd.it("should wrap an AsyncIterable as a Source", async () => {
    async function* events(): AsyncIterable<generation.StreamEvent> {
      yield { kind: "content_delta", textDelta: "test" };
    }

    const source = sourcesModule.streamEventSource(events(), "custom-name");
    assert.assertEquals(source.name, "custom-name");

    const reader = source.readable.getReader();
    const result = await reader.read();
    assert.assertEquals(result.value?.data.kind, "content_delta");
  });
});
