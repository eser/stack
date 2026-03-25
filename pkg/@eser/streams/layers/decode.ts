// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatOptions } from "@eser/formats";
import { deserialize, registerBuiltinFormats } from "@eser/formats";
import type { Chunk, Layer } from "../types.ts";
import { defineLayer } from "../define-layer.ts";

let formatsRegistered = false;

export const decode = (
  format: string,
  options?: FormatOptions,
): Layer<string, unknown> => {
  return defineLayer<string, unknown>({
    name: `decode(${format})`,
    create: () => ({
      start() {
        if (!formatsRegistered) {
          registerBuiltinFormats();
          formatsRegistered = true;
        }
      },
      transform(chunk, controller) {
        const items = deserialize(String(chunk.data), format, options);
        for (const item of items) {
          controller.enqueue({
            data: item,
            meta: { ...chunk.meta, kind: "structured" },
          } as Chunk<unknown>);
        }
      },
    }),
  });
};
