// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, ChunkMeta } from "./types.ts";

export const createChunk = <T>(
  data: T,
  overrides?: Partial<ChunkMeta>,
): Chunk<T> => {
  const kind = typeof data === "string"
    ? "text" as const
    : data instanceof Uint8Array
    ? "bytes" as const
    : "structured" as const;

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
