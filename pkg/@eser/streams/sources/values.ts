// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Source } from "../types.ts";
import { createChunk } from "../chunk.ts";

export const values = <T = unknown>(...items: T[]): Source<T> => {
  return {
    name: "values",
    readable: new ReadableStream<Chunk<T>>({
      start(controller) {
        for (const item of items) {
          controller.enqueue(createChunk(item));
        }
        controller.close();
      },
    }),
  };
};
