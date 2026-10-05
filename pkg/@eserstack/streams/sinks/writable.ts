// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

/**
 * Wraps a `WritableStream` of chunks as a sink, for destinations this package
 * has no sink for, such as a file or a socket.
 *
 * @param stream - The stream that receives each chunk
 * @param name - The sink name; defaults to `writable`
 * @returns The sink
 */
export const writable = <T = unknown>(
  stream: WritableStream<Chunk<T>>,
  name?: string,
): Sink<T> => {
  return {
    name: name ?? "writable",
    writable: stream,
  };
};
