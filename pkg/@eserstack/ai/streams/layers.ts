// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as streams from "@eserstack/streams";
import type * as generation from "../generation.ts";

// =============================================================================
// Extract Text Layer
// =============================================================================

export const extractText = (): streams.Layer<
  generation.StreamEvent,
  string
> => {
  return streams.defineLayer<generation.StreamEvent, string>({
    name: "ai/extract-text",
    create: () => ({
      transform: (chunk, controller) => {
        if (chunk.data.kind === "content_delta") {
          controller.enqueue(streams.createChunk(chunk.data.textDelta));
        }
      },
    }),
  });
};

// =============================================================================
// Token Counter Layer
// =============================================================================

export const tokenCounter = (
  onUsage: (usage: generation.Usage) => void,
): streams.Layer<generation.StreamEvent, generation.StreamEvent> => {
  return streams.defineLayer<generation.StreamEvent, generation.StreamEvent>({
    name: "ai/token-counter",
    create: () => ({
      transform: (chunk, controller) => {
        if (chunk.data.kind === "message_done") {
          onUsage(chunk.data.usage);
        }
        controller.enqueue(streams.createChunk(chunk.data));
      },
    }),
  });
};
