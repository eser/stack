// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Source } from "../types.ts";
import * as chunk from "../chunk.ts";

/**
 * Creates a source that yields one chunk for each `eventName` event dispatched
 * on `target`. The data is the event's `detail` for a `CustomEvent` and the
 * event itself otherwise.
 *
 * The source never ends by itself. Cancel its stream, or the pipeline reading
 * it, to stop listening; cancelling removes the event listener.
 *
 * @param target - The target to listen on
 * @param eventName - The event type to listen for
 * @returns A source named `events(<eventName>)`
 */
export const events = <T = unknown>(
  target: EventTarget,
  eventName: string,
): Source<T> => {
  let handler: ((event: Event) => void) | null = null;

  return {
    name: `events(${eventName})`,
    readable: new ReadableStream<Chunk<T>>({
      start(controller) {
        handler = (event: Event) => {
          const data = event instanceof CustomEvent
            ? event.detail as T
            : event as unknown as T;
          controller.enqueue(chunk.createChunk(data));
        };

        target.addEventListener(eventName, handler);
      },
      cancel() {
        if (handler !== null) {
          target.removeEventListener(eventName, handler);
          handler = null;
        }
      },
    }),
  };
};
