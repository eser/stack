// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eser/standards/cross-runtime";
import type { Source } from "../types.ts";
import { createChunk } from "../chunk.ts";

export const stdin = (): Source<Uint8Array> => {
  const stdinStream = runtime.process.stdin;

  return {
    name: "stdin",
    readable: stdinStream.pipeThrough(
      new TransformStream({
        transform(bytes, controller) {
          controller.enqueue(createChunk(bytes, { kind: "bytes" }));
        },
      }),
    ),
  };
};
