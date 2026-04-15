// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eserstack/standards/cross-runtime";
import type { Chunk, Sink } from "../types.ts";

let encoder: TextEncoder | undefined;
const getEncoder = (): TextEncoder => {
  if (encoder === undefined) {
    encoder = new TextEncoder();
  }
  return encoder;
};

export const stdout = (): Sink<unknown> => {
  const stdoutStream = runtime.process.stdout;

  return {
    name: "stdout",
    writable: new WritableStream<Chunk<unknown>>({
      async write(chunk) {
        const text = String(chunk.data);
        const bytes = getEncoder().encode(text);
        const writer = stdoutStream.getWriter();
        try {
          await writer.write(bytes);
        } finally {
          writer.releaseLock();
        }
      },
    }),
  };
};
