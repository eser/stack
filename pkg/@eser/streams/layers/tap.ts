// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Layer } from "../types.ts";
import { defineLayer } from "../define-layer.ts";

export const tap = <T = unknown>(
  fn: (chunk: Chunk<T>) => void,
): Layer<T, T> => {
  return defineLayer<T, T>({
    name: "tap",
    create: () => ({
      transform(chunk, controller) {
        fn(chunk);
        controller.enqueue(chunk);
      },
    }),
  });
};
