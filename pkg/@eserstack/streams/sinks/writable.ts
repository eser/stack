// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Sink } from "../types.ts";

export const writable = <T = unknown>(
  stream: WritableStream<Chunk<T>>,
  name?: string,
): Sink<T> => {
  return {
    name: name ?? "writable",
    writable: stream,
  };
};
