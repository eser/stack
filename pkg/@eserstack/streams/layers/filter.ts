// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Layer } from "../types.ts";
import * as defineLayer from "../define-layer.ts";

/**
 * Creates a layer that passes on the chunks whose data matches `predicate` and
 * drops the rest.
 *
 * @param predicate - Returns `true` for data to keep
 * @returns A layer named `filter`
 */
export const filter = <T = unknown>(
  predicate: (data: T) => boolean,
): Layer<T, T> => {
  return defineLayer.defineLayer<T, T>({
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
