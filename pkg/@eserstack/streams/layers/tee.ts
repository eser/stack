// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Layer, Sink } from "../types.ts";

/**
 * Creates a layer that writes each chunk to `sink` as well and passes it on
 * unchanged. The sink is closed when the stream ends.
 *
 * The layer takes the sink's writer when it is created, so use a separate
 * `tee()` for each stream.
 *
 * @param sink - The extra sink that receives a copy of every chunk
 * @returns A layer named `tee(<sink name>)`
 */
export const tee = <T = unknown>(
  sink: Sink<T>,
): Layer<T, T> => {
  const sinkWriter = sink.writable.getWriter();

  return {
    name: `tee(${sink.name})`,
    transform: () =>
      new TransformStream<Chunk<T>, Chunk<T>>({
        async transform(chunk, controller) {
          // Send to the tee sink
          await sinkWriter.write(chunk);
          // Pass through unchanged
          controller.enqueue(chunk);
        },
        async flush() {
          await sinkWriter.close();
        },
      }),
  };
};
