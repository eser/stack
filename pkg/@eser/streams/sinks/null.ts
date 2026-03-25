// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

export const nullSink = (): Sink<unknown> => {
  return {
    name: "null",
    writable: new WritableStream<Chunk<unknown>>({
      write(_chunk) {
        // Discard
      },
    }),
  };
};
