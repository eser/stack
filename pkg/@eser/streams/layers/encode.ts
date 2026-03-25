// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions } from "@eser/formats";
import { registerBuiltinFormats, serialize } from "@eser/formats";
import type { Layer } from "../types.ts";
import { defineLayer } from "../define-layer.ts";

let formatsRegistered = false;

export const encode = (
  format: string,
  options?: FormatOptions,
): Layer<unknown, string> => {
  return defineLayer<unknown, string>({
    name: `encode(${format})`,
    create: () => ({
      start() {
        if (!formatsRegistered) {
          registerBuiltinFormats();
          formatsRegistered = true;
        }
      },
      transform(chunk, controller) {
        const text = serialize(chunk.data, format, options);
        controller.enqueue({
          data: text,
          meta: { ...chunk.meta, kind: "text" },
        });
      },
    }),
  });
};
