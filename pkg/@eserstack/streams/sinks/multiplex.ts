// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

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
