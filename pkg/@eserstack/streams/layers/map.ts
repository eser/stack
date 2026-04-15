// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Layer } from "../types.ts";
import { defineLayer } from "../define-layer.ts";

export const map = <I = unknown, O = unknown>(
  fn: (data: I) => O,
): Layer<I, O> => {
  return defineLayer<I, O>({
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
