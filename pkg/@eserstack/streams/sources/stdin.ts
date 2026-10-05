// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eserstack/standards/cross-runtime";
import type { Source } from "../types.ts";
import * as chunk from "../chunk.ts";

/**
 * Creates a source that reads the process stdin as `bytes` chunks.
 *
 * @returns A source named `stdin`
 */
export const stdin = (): Source<Uint8Array> => {
  const stdinStream = runtime.process.stdin;

  return {
    name: "stdin",
    readable: stdinStream.pipeThrough(
      new TransformStream({
        transform(bytes, controller) {
          controller.enqueue(chunk.createChunk(bytes, { kind: "bytes" }));
        },
      }),
    ),
  };
};
