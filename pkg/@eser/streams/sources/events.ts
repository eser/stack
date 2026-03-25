// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Source } from "../types.ts";
import { createChunk } from "../chunk.ts";

export const events = <T = unknown>(
  target: EventTarget,
  eventName: string,
): Source<T> => {
  return {
    name: `events(${eventName})`,
    readable: new ReadableStream<Chunk<T>>({
      start(controller) {
        const handler = (event: Event) => {
          const data = event instanceof CustomEvent
            ? event.detail as T
            : event as unknown as T;
          controller.enqueue(createChunk(data));
        };

        target.addEventListener(eventName, handler);

        // Clean up when the stream is cancelled
        const originalCancel = controller.desiredSize;
        void originalCancel; // reference to prevent unused warning
      },
    }),
  };
};
