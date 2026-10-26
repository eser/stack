// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Web stream wrappers for the Node adapter.
 *
 * @module
 */

/**
 * Returns a readable stream that opens its source on the first read.
 *
 * The Node adapter wraps process.stdin with it. `Readable.toWeb` puts
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
 * The Node adapter wraps process.stdout and process.stderr with it, so
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
