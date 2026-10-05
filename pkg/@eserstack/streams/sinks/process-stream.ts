// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

let encoder: TextEncoder | undefined;
const getEncoder = (): TextEncoder => {
  if (encoder === undefined) {
    encoder = new TextEncoder();
  }
  return encoder;
};

// The process stdout and stderr streams take one writer at a time, and every
// stdout() or stderr() sink in the process writes to the same stream. Writes
// from all sinks wait on one chain per stream, so a sink whose write overlaps
// another sink's waits its turn instead of failing with "The stream is
// already locked". The chain is keyed by the stream because the stream itself
// is process-wide; the WeakMap lets an unused stream be collected.
const writeChains = new WeakMap<WritableStream<Uint8Array>, Promise<void>>();

/**
 * Writes text to a process stream such as `runtime.process.stdout`, after
 * every earlier write that went through this function to the same stream.
 *
 * The writer lock is taken for one write and released after it, so code that
 * writes to the stream directly can still take it between writes.
 */
export const writeToProcessStream = (
  stream: WritableStream<Uint8Array>,
  text: string,
): Promise<void> => {
  const bytes = getEncoder().encode(text);
  const previous = writeChains.get(stream) ?? Promise.resolve();

  const current = previous.then(async () => {
    const writer = stream.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  });

  // The caller receives the rejection through `current`; the chain swallows it
  // so one failed write does not fail every later write to the stream.
  writeChains.set(stream, current.catch(() => {}));

  return current;
};
