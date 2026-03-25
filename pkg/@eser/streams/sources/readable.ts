// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Source } from "../types.ts";
import { createChunk } from "../chunk.ts";

export const readable = <T = unknown>(
  stream: ReadableStream<T>,
  name?: string,
): Source<T> => {
  return {
    name: name ?? "readable",
    readable: stream.pipeThrough(
      new TransformStream<T, ReturnType<typeof createChunk<T>>>({
        transform(item, controller) {
          controller.enqueue(createChunk(item));
        },
      }),
    ),
  };
};
