// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

/** A sink that keeps every chunk written to it in memory. */
export type BufferSink<T = unknown> = Sink<T> & {
  /** Returns the chunks written so far, with their metadata. */
  readonly chunks: () => readonly Chunk<T>[];
  /** Returns the data of the chunks written so far. */
  readonly items: () => readonly T[];
  /** Drops every collected chunk. */
  readonly clear: () => void;
};

/**
 * Creates a sink that collects chunks in memory instead of writing them out.
 * `output()` uses it when no sink is given, and tests use it to read what was
 * written.
 *
 * @returns A sink named `buffer`
 *
 * @example
 * ```typescript
 * import * as streams from "@eserstack/streams";
 *
 * const sink = streams.sinks.buffer<string>();
 * const out = streams.output({ sink });
 * out.writeln("hello");
 * await out.close();
 *
 * sink.items(); // ["hello\n"]
 * ```
 */
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
