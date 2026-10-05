// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Layer } from "../types.ts";
import * as defineLayer from "../define-layer.ts";

/**
 * Creates a layer that replaces each chunk's data with `fn(data)` and keeps
 * its metadata.
 *
 * @param fn - Converts the data of one chunk
 * @returns A layer named `map`
 */
export const map = <I = unknown, O = unknown>(
  fn: (data: I) => O,
): Layer<I, O> => {
  return defineLayer.defineLayer<I, O>({
    name: "map",
    create: () => ({
      transform(chunk, controller) {
        controller.enqueue({
          data: fn(chunk.data),
          meta: chunk.meta,
        });
      },
    }),
  });
};
