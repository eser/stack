// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  Chunk,
  ErrorContext,
  ErrorHandler,
  Layer,
  Output,
  OutputOptions,
} from "./types.ts";
import { createChunk } from "./chunk.ts";
import { normalize } from "./span.ts";
import type { SpanInput } from "./span.ts";
import { plain as plainRenderer } from "./renderers/plain.ts";
import { buffer as bufferSink } from "./sinks/buffer.ts";

// =============================================================================
// output() — The console.log replacement
//
// Sync write, async flush. Internal buffer drained via queueMicrotask.
//
//   write(data)  →  Chunk<T> buffer  →  [microtask drain]  →  Layer chain  →  Sink
//        (sync)      (sync push)        (async)               (TransformStream)
// =============================================================================

const defaultErrorHandler: ErrorHandler = (context: ErrorContext) => {
  console.error(
    `[streams] Error at chunk #${context.chunkIndex} (${context.pendingCount} pending):`,
    context.error,
  );
};

export const output = (options?: OutputOptions): Output => {
  const pendingChunks: Chunk[] = [];
  const onError = options?.onError ?? defaultErrorHandler;
  const renderer = options?.renderer ?? plainRenderer();

  let drainScheduled = false;
  let chunkIndex = 0;
  let closed = false;

  // Resolve when buffer is fully drained
  let flushResolve: (() => void) | undefined;

  // Build the writable target: layers → sink
  const buildWritable = (): WritableStream<Chunk> => {
    const sink = options?.sink ?? bufferSink();
    const layers = options?.layers ?? [];

    if (layers.length === 0) {
      return sink.writable;
    }

    // Chain layers: readable → layer1 → layer2 → ... → sink
    const { readable, writable } = new TransformStream<Chunk, Chunk>();
    let stream: ReadableStream<Chunk> = readable;

    for (const layer of layers) {
      // deno-lint-ignore no-explicit-any
      stream = stream.pipeThrough(layer.transform() as any);
    }

    // Pipe the final stream to the sink (fire-and-forget, errors handled below)
    stream.pipeTo(sink.writable).catch((error) => {
      onError({
        error,
        chunkIndex,
        pendingCount: pendingChunks.length,
        lastChunk: pendingChunks[pendingChunks.length - 1],
      });
    });

    return writable;
  };

  const target = buildWritable();
  const writer = target.getWriter();

  const drain = async () => {
    drainScheduled = false;

    while (pendingChunks.length > 0) {
      const chunk = pendingChunks.shift()!;
      try {
        await writer.ready;
        await writer.write(chunk);
        chunkIndex++;
      } catch (error) {
        onError({
          error,
          chunkIndex,
          pendingCount: pendingChunks.length,
          lastChunk: chunk,
        });
        // Clear remaining on error
        pendingChunks.length = 0;
        break;
      }
    }

    if (flushResolve !== undefined) {
      flushResolve();
      flushResolve = undefined;
    }
  };

  const scheduleDrain = () => {
    if (!drainScheduled) {
      drainScheduled = true;
      queueMicrotask(drain);
    }
  };

  const enqueue = (chunk: Chunk): void => {
    if (closed) return;
    pendingChunks.push(chunk);
    scheduleDrain();
  };

  const self: Output = {
    write: (...args: SpanInput[]): void => {
      const spans = normalize(args);
      const rendered = renderer.render(spans);
      enqueue(createChunk(rendered));
    },

    writeln: (...args: SpanInput[]): void => {
      const spans = normalize(args);
      const rendered = renderer.render(spans) + "\n";
      enqueue(createChunk(rendered));
    },

    flush: (): Promise<void> => {
      if (pendingChunks.length === 0 && !drainScheduled) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        flushResolve = resolve;
        scheduleDrain();
      });
    },

    close: async (): Promise<void> => {
      closed = true;
      await self.flush();
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    },

    pipe: (...layers: Layer[]): Output => {
      return output({
        sink: options?.sink,
        renderer: options?.renderer,
        layers: [...(options?.layers ?? []), ...layers],
        onError,
      });
    },
  };

  return self;
};
