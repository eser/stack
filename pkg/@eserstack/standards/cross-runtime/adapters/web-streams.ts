// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Web stream wrappers shared by the Node and Bun adapters.
 *
 * @module
 */

/**
 * Returns a readable stream that opens its source on the first read.
 *
 * The Node and Bun adapters wrap process.stdin with it. `Readable.toWeb` puts
 * stdin into flowing mode, and a flowing stdin keeps the process alive until
 * the pipe closes, so a CLI that never reads stdin would hang on an open pipe.
 * With this wrapper, `open` runs only when a consumer reads.
 *
 * @param open - Creates the source stream; called once, on the first read
 * @returns A stream that passes the source's chunks through
 */
export const createLazyReadable = (
  open: () => ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const getReader = (): ReadableStreamDefaultReader<Uint8Array> => {
    if (reader === null) {
      reader = open().getReader();
    }

    return reader;
  };

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller): Promise<void> {
        const result = await getReader().read();

        if (result.done) {
          controller.close();
          return;
        }

        controller.enqueue(result.value);
      },

      async cancel(reason): Promise<void> {
        // A source that was never opened holds nothing to release.
        if (reader !== null) {
          await reader.cancel(reason);
        }
      },
    },
    // With a high-water mark of 0 the stream pulls only for a pending read,
    // never ahead of one, so creating it opens nothing.
    { highWaterMark: 0 },
  );
};

/**
 * Returns a writable stream that opens its sink on the first write.
 *
 * The Node and Bun adapters wrap process.stdout and process.stderr with it, so
 * creating the runtime attaches no listeners to the process streams.
 *
 * @param open - Creates the sink stream; called once, on the first write
 * @returns A stream that passes each chunk to the sink
 */
export const createLazyWritable = (
  open: () => WritableStream<Uint8Array>,
): WritableStream<Uint8Array> => {
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  const getWriter = (): WritableStreamDefaultWriter<Uint8Array> => {
    if (writer === null) {
      writer = open().getWriter();
    }

    return writer;
  };

  return new WritableStream<Uint8Array>({
    async write(chunk): Promise<void> {
      await getWriter().write(chunk);
    },

    async close(): Promise<void> {
      // Closing a stream nobody wrote to leaves the process stream untouched.
      if (writer !== null) {
        await writer.close();
      }
    },

    async abort(reason): Promise<void> {
      if (writer !== null) {
        await writer.abort(reason);
      }
    },
  });
};

/**
 * The part of Bun's `FileSink` that {@link createFileSinkWritable} calls.
 *
 * `Bun.spawn` returns a `FileSink` for a piped child stdin, not a
 * `WritableStream`, so it has no `getWriter`.
 */
export type FileSinkLike = {
  /** Buffers a chunk; returns the byte count, or a promise of it. */
  write(chunk: Uint8Array): number | Promise<number>;
  /** Writes the buffered bytes to the file descriptor. */
  flush(): number | Promise<number>;
  /** Flushes and closes the file descriptor. */
  end(error?: Error): number | Promise<number>;
};

/**
 * Wraps a Bun `FileSink` in a `WritableStream`.
 *
 * Each write is flushed before it resolves: `FileSink` buffers writes, and an
 * interactive child (a REPL, a PTY) must see a chunk as soon as it is written,
 * not when the buffer fills.
 *
 * @param sink - The `FileSink` of a piped child stdin
 * @returns A stream whose close ends the sink
 */
export const createFileSinkWritable = (
  sink: FileSinkLike,
): WritableStream<Uint8Array> =>
  new WritableStream<Uint8Array>({
    async write(chunk): Promise<void> {
      await sink.write(chunk);
      await sink.flush();
    },

    async close(): Promise<void> {
      await sink.end();
    },

    async abort(reason): Promise<void> {
      await sink.end(reason instanceof Error ? reason : undefined);
    },
  });
