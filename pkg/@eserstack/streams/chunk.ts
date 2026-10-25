// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, ChunkMeta } from "./types.ts";

/**
 * Wraps data in a chunk. The kind is `text` for a string, `bytes` for a
 * `Uint8Array` and `structured` otherwise, and the channel is `stdout`;
 * `overrides` replaces any of these.
 *
 * @param data - The data to carry
 * @param overrides - Metadata fields to set
 * @returns The chunk
 */
export const createChunk = <T>(
  data: T,
  overrides?: Partial<ChunkMeta>,
): Chunk<T> => {
  const kind =
    typeof data === "string"
      ? ("text" as const)
      : data instanceof Uint8Array
        ? ("bytes" as const)
        : ("structured" as const);

  return {
    data,
    meta: {
      timestamp: Date.now(),
      kind,
      channel: "stdout",
      ...overrides,
    },
  };
};
