// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Layer } from "../types.ts";
import * as defineLayer from "../define-layer.ts";

/**
 * Creates a layer that calls `fn` with each chunk and passes the chunk on
 * unchanged, for logging or counting.
 *
 * @param fn - Called with each chunk before it is passed on
 * @returns A layer named `tap`
 */
export const tap = <T = unknown>(
  fn: (chunk: Chunk<T>) => void,
): Layer<T, T> => {
  return defineLayer.defineLayer<T, T>({
    name: "tap",
    create: () => ({
      transform(chunk, controller) {
        fn(chunk);
        controller.enqueue(chunk);
      },
    }),
  });
};
