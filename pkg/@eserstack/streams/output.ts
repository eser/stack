// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  Chunk,
  ErrorContext,
  ErrorHandler,
  Layer,
  Output,
  OutputOptions,
} from "./types.ts";
import * as chunk from "./chunk.ts";
import * as span from "./span.ts";
import type { SpanInput } from "./span.ts";
import * as plain from "./renderers/plain.ts";
import * as buffer from "./sinks/buffer.ts";

// =============================================================================
// output() — The console.log replacement
//
// Sync write, async flush. Internal buffer drained via queueMicrotask.
//
//   write(data)  →  Chunk<T> buffer  →  [microtask drain]  →  Layer chain  →  Sink
//        (sync)      (sync push)        (async)               (TransformStream)
// =============================================================================

const defaultErrorHandler: ErrorHandler = (context: ErrorContext) => {
  // Last-resort report when the caller passes no onError. This package sits
  // below @eserstack/logging, so stderr through console is the reporter left.
  // oxlint-disable-next-line no-console
  console.error(
    `[streams] Error at chunk #${context.chunkIndex} (${context.pendingCount} pending):`,
    context.error,
  );
};

/**
 * Creates an output that renders spans and writes them to a sink. Writes
 * return at once; call `flush()` to wait until they reach the sink, and
 * `close()` when done.
 *
 * @param options - Sink, renderer, layers and error handler
 * @returns The output
 *
 * @example
 * ```typescript
 * import * as streams from "@eserstack/streams";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 *
 * out.writeln(streams.span.bold("Done"), " in 2 steps");
 * await out.close();
 * ```
 */
export const output = (options?: OutputOptions): Output => {
  const pendingChunks: Chunk[] = [];
  const onError = options?.onError ?? defaultErrorHandler;
  const renderer = options?.renderer ?? plain.plain();

  // True from the moment a drain is scheduled until it finds the buffer empty.
  // Invariant: a chunk in pendingChunks always has a drain scheduled or running.
  let draining = false;
  let chunkIndex = 0;
  let closed = false;

  // Callers of flush() waiting for the buffer to drain
  const flushWaiters: (() => void)[] = [];

  // Build the writable target: layers → sink
  const buildWritable = (): WritableStream<Chunk> => {
    const sink = options?.sink ?? buffer.buffer();
    const layers = options?.layers ?? [];

    if (layers.length === 0) {
      return sink.writable;
    }

    // Chain layers: readable → layer1 → layer2 → ... → sink
    const { readable, writable } = new TransformStream<Chunk, Chunk>();
    let stream: ReadableStream<Chunk> = readable;

    for (const layer of layers) {
      // oxlint-disable-next-line typescript/no-explicit-any
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

  // One drain at a time: two drains racing close() would throw "stream is
  // closing". The running drain re-checks pendingChunks after every write, so
  // it picks up chunks enqueued while it was awaiting, and it clears `draining`
  // in the same synchronous step that finds the buffer empty, so a chunk
  // enqueued after that schedules a new drain. Keep it to this one flag: a
  // second "scheduled" flag, left set by a drain that skipped because another
  // was running, stopped every later drain and close() never resolved.
  const drain = async () => {
    try {
      while (pendingChunks.length > 0) {
        const nextChunk = pendingChunks.shift()!;
        try {
          // Chunks are written one at a time so they reach the sink in order
          // and each write waits for the sink's backpressure.
          // oxlint-disable-next-line no-await-in-loop
          await writer.ready;
          // oxlint-disable-next-line no-await-in-loop
          await writer.write(nextChunk);
          chunkIndex++;
        } catch (error) {
          const pendingCount = pendingChunks.length;
          // The sink failed, so the rest of the buffer is dropped. It is
          // cleared before onError runs, so a throwing handler cannot leave
          // chunks queued with no drain to write them.
          pendingChunks.length = 0;
          onError({ error, chunkIndex, pendingCount, lastChunk: nextChunk });
          break;
        }
      }
    } finally {
      draining = false;

      for (const resolve of flushWaiters.splice(0)) {
        resolve();
      }
    }
  };

  const scheduleDrain = () => {
    if (draining) return;
    draining = true;
    queueMicrotask(drain);
  };

  const enqueue = (queuedChunk: Chunk): void => {
    if (closed) return;
    pendingChunks.push(queuedChunk);
    scheduleDrain();
  };

  const self: Output = {
    write: (...args: SpanInput[]): void => {
      const spans = span.normalize(args);
      const rendered = renderer.render(spans);
      enqueue(chunk.createChunk(rendered));
    },

    writeln: (...args: SpanInput[]): void => {
      const spans = span.normalize(args);
      const rendered = renderer.render(spans) + "\n";
      enqueue(chunk.createChunk(rendered));
    },

    flush: (): Promise<void> => {
      // `draining` also covers a drain that is mid-write with an empty queue;
      // returning early then would let close() reach writer.close() while a
      // write is still in flight, rejecting it with "stream is closing or is
      // closed". By the invariant above, the queue is empty when no drain is
      // scheduled or running.
      if (!draining) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        flushWaiters.push(resolve);
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
