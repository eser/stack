// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Source } from "../types.ts";
import * as chunk from "../chunk.ts";

/**
 * Wraps a `ReadableStream` as a source, putting each item it yields in a
 * chunk.
 *
 * @param stream - The stream to read
 * @param name - The source name; defaults to `readable`
 * @returns The source
 */
export const readable = <T = unknown>(
  stream: ReadableStream<T>,
  name?: string,
): Source<T> => {
  return {
    name: name ?? "readable",
    readable: stream.pipeThrough(
      new TransformStream<T, ReturnType<typeof chunk.createChunk<T>>>({
        transform(item, controller) {
          controller.enqueue(chunk.createChunk(item));
        },
      }),
    ),
  };
};
