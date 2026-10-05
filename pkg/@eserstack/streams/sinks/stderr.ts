// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eserstack/standards/cross-runtime";
import type { Chunk, Sink } from "../types.ts";
import * as processStream from "./process-stream.ts";

/**
 * Creates a sink that writes each chunk's data, as text, to the process
 * stderr. All `stderr()` sinks in the process share one write queue, so their
 * writes keep their order and do not fail on the stream lock.
 *
 * @returns A sink named `stderr`
 */
export const stderr = (): Sink<unknown> => {
  const stderrStream = runtime.process.stderr;

  return {
    name: "stderr",
    writable: new WritableStream<Chunk<unknown>>({
      async write(chunk) {
        await processStream.writeToProcessStream(
          stderrStream,
          String(chunk.data),
        );
      },
    }),
  };
};
