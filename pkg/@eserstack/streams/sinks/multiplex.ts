// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

/**
 * Creates a sink that writes each chunk to all of the given sinks and waits
 * for every write. Closing or aborting it closes or aborts each of them.
 *
 * The multiplex sink takes each given sink's writer when it is created, so the
 * given sinks cannot be written to directly afterwards.
 *
 * @param sinks - The sinks that receive every chunk
 * @returns A sink named `multiplex(<names>)`
 */
export const multiplex = <T = unknown>(
  ...sinks: Sink<T>[]
): Sink<T> => {
  const writers = sinks.map((s) => ({
    name: s.name,
    writer: s.writable.getWriter(),
  }));

  return {
    name: `multiplex(${sinks.map((s) => s.name).join(",")})`,
    writable: new WritableStream<Chunk<T>>({
      async write(chunk) {
        await Promise.all(writers.map((w) => w.writer.write(chunk)));
      },
      async close() {
        await Promise.all(writers.map((w) => w.writer.close()));
      },
      async abort(reason) {
        await Promise.all(writers.map((w) => w.writer.abort(reason)));
      },
    }),
  };
};
