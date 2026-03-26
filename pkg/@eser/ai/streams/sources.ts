// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as streams from "@eser/streams";
import type * as model from "../model.ts";
import type * as generation from "../generation.ts";

// =============================================================================
// AI Source — StreamEvent chunks
// =============================================================================

export const aiSource = (
  languageModel: model.LanguageModel,
  options: generation.GenerateTextOptions,
  signal?: AbortSignal,
): streams.Source<generation.StreamEvent> => {
  const iterable = languageModel.streamText(options, signal);

  return {
    name: `ai/${languageModel.provider}/${languageModel.modelId}`,
    readable: new ReadableStream<streams.Chunk<generation.StreamEvent>>({
      async start(controller) {
        try {
          for await (const event of iterable) {
            controller.enqueue(streams.createChunk(event));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    }),
  };
};

// =============================================================================
// AI Text Source — string chunks (text deltas only)
// =============================================================================

export const aiTextSource = (
  languageModel: model.LanguageModel,
  options: generation.GenerateTextOptions,
  signal?: AbortSignal,
): streams.Source<string> => {
  const iterable = languageModel.streamText(options, signal);

  return {
    name: `ai-text/${languageModel.provider}/${languageModel.modelId}`,
    readable: new ReadableStream<streams.Chunk<string>>({
      async start(controller) {
        try {
          for await (const event of iterable) {
            if (event.kind === "content_delta") {
              controller.enqueue(streams.createChunk(event.textDelta));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    }),
  };
};

// =============================================================================
// Wrap existing AsyncIterable as Source
// =============================================================================

export const streamEventSource = (
  stream: AsyncIterable<generation.StreamEvent>,
  name?: string,
): streams.Source<generation.StreamEvent> => {
  return {
    name: name ?? "ai-stream",
    readable: new ReadableStream<streams.Chunk<generation.StreamEvent>>({
      async start(controller) {
        try {
          for await (const event of stream) {
            controller.enqueue(streams.createChunk(event));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    }),
  };
};
