// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as streams from "@eserstack/streams";
import type * as generation from "../generation.ts";
import * as layersModule from "./layers.ts";
import * as sourcesModule from "./sources.ts";

// =============================================================================
// Tests
// =============================================================================

bdd.describe("extractText layer", () => {
  bdd.it("should extract text deltas from stream events", async () => {
    async function* events(): AsyncIterable<generation.StreamEvent> {
      yield { kind: "content_delta", textDelta: "Hello " };
      yield { kind: "tool_call_delta", textDelta: "partial" };
      yield { kind: "content_delta", textDelta: "world!" };
      yield {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      };
    }

    const source = sourcesModule.streamEventSource(events());
    const layer = layersModule.extractText();

    const result = await streams.pipeline()
      .from(source)
      .through(layer)
      .collect<string>();

    assert.assertEquals(result.length, 2);
    assert.assertEquals(result[0], "Hello ");
    assert.assertEquals(result[1], "world!");
  });
});

bdd.describe("tokenCounter layer", () => {
  bdd.it("should call onUsage when message_done event arrives", async () => {
    let capturedUsage: generation.Usage | null = null as
      | generation.Usage
      | null;

    async function* events(): AsyncIterable<generation.StreamEvent> {
      yield { kind: "content_delta", textDelta: "Hello" };
      yield {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    }

    const source = sourcesModule.streamEventSource(events());
    const counter = layersModule.tokenCounter((usage) => {
      capturedUsage = usage;
    });

    const result = await streams.pipeline()
      .from(source)
      .through(counter)
      .collect<generation.StreamEvent>();

    assert.assertEquals(result.length, 2);
    assert.assertEquals(capturedUsage?.inputTokens, 10);
    assert.assertEquals(capturedUsage?.outputTokens, 5);
    assert.assertEquals(capturedUsage?.totalTokens, 15);
  });
});
