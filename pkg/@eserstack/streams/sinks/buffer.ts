// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

export type BufferSink<T = unknown> = Sink<T> & {
  readonly chunks: () => readonly Chunk<T>[];
  readonly items: () => readonly T[];
  readonly clear: () => void;
};

export const buffer = <T = unknown>(): BufferSink<T> => {
  const collected: Chunk<T>[] = [];

  return {
    name: "buffer",
    writable: new WritableStream<Chunk<T>>({
      write(chunk) {
        collected.push(chunk);
      },
    }),
    chunks: () => collected,
    items: () => collected.map((c) => c.data),
    clear: () => {
      collected.length = 0;
    },
  };
};
