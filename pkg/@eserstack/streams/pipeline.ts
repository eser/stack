// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  Chunk,
  Layer,
  Pipeline,
  PipelineOptions,
  Sink,
  Source,
} from "./types.ts";
import { PipelineError, TimeoutError } from "./types.ts";
import { buffer as bufferSink } from "./sinks/buffer.ts";

// =============================================================================
// pipeline() — Composable stream builder
//
//   pipeline()
//     .from(source)
//     .through(layer1, layer2)
//     .to(sink)
//     .run({ timeout: 5000 })
//
//   Data flow:
//     Source.readable → pipeThrough(layer1) → pipeThrough(layer2) → pipeTo(sink)
// =============================================================================

export const pipeline = (): Pipeline => {
  let source: Source | undefined;
  const layers: Layer[] = [];
  let sink: Sink | undefined;

  const self: Pipeline = {
    from: (s: Source): Pipeline => {
      source = s;
      return self;
    },

    through: (...newLayers: Layer[]): Pipeline => {
      layers.push(...newLayers);
      return self;
    },

    to: (s: Sink): Pipeline => {
      sink = s;
      return self;
    },

    run: async (options?: PipelineOptions): Promise<void> => {
      if (source === undefined) {
        throw new PipelineError("Pipeline has no source. Call .from() first.");
      }
      if (sink === undefined) {
        throw new PipelineError("Pipeline has no sink. Call .to() first.");
      }

      // Build the pipeline chain
      // deno-lint-ignore no-explicit-any
      let stream: ReadableStream<Chunk<any>> = source.readable;

      for (const layer of layers) {
        // deno-lint-ignore no-explicit-any
        stream = stream.pipeThrough(layer.transform() as any);
      }

      // Set up abort controller for timeout
      const abortController = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (options?.timeout !== undefined && options.timeout > 0) {
        timeoutId = setTimeout(() => {
          abortController.abort(new TimeoutError(options.timeout!));
        }, options.timeout);
      }

      try {
        await stream.pipeTo(sink.writable, {
          signal: abortController.signal,
        });
      } catch (error) {
        if (error instanceof TimeoutError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new TimeoutError(options?.timeout ?? 0);
        }
        throw new PipelineError(
          `Pipeline failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error : undefined,
        );
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },

    collect: async <T = unknown>(): Promise<T[]> => {
      const buf = bufferSink<T>();
      sink = buf;

      await self.run();

      return buf.items() as T[];
    },
  };

  return self;
};
