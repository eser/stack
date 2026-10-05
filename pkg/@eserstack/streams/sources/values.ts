// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Source } from "../types.ts";
import * as chunk from "../chunk.ts";

/**
 * Creates a source that yields the given items in order, one chunk each, and
 * then ends.
 *
 * @param items - The items to yield
 * @returns A source named `values`
 *
 * @example
 * ```typescript
 * import * as streams from "@eserstack/streams";
 *
 * const doubled = await streams.pipeline()
 *   .from(streams.sources.values(1, 2, 3))
 *   .through(streams.layers.map((n: number) => n * 2))
 *   .collect<number>(); // [2, 4, 6]
 * ```
 */
export const values = <T = unknown>(...items: T[]): Source<T> => {
  return {
    name: "values",
    readable: new ReadableStream<Chunk<T>>({
      start(controller) {
        for (const item of items) {
          controller.enqueue(chunk.createChunk(item));
        }
        controller.close();
      },
    }),
  };
};
