// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Layer } from "../types.ts";
import { defineLayer } from "../define-layer.ts";

export const filter = <T = unknown>(
  predicate: (data: T) => boolean,
): Layer<T, T> => {
  return defineLayer<T, T>({
    name: "filter",
    create: () => ({
      transform(chunk, controller) {
        if (predicate(chunk.data)) {
          controller.enqueue(chunk);
        }
      },
    }),
  });
};
