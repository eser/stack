// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as webStreams from "./web-streams.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sourceOf = (...chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

// =============================================================================
// createLazyReadable
// =============================================================================

nodeTest.test(
  "createLazyReadable does not open the source until a read",
  async () => {
    let opens = 0;
    const stream = webStreams.createLazyReadable(() => {
      opens++;
      return sourceOf("a");
    });

    // Give the stream a chance to pull ahead of a read.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.assertEquals(opens, 0);

    const reader = stream.getReader();
    assert.assertEquals(opens, 0);

    const first = await reader.read();
    assert.assertEquals(opens, 1);
    assert.assertEquals(decoder.decode(first.value), "a");

    reader.releaseLock();
    await stream.cancel();
  },
);

nodeTest.test(
  "createLazyReadable passes every chunk through, then closes",
  async () => {
    let opens = 0;
    const stream = webStreams.createLazyReadable(() => {
      opens++;
      return sourceOf("one ", "two ", "three");
    });

    const text = await new Response(stream).text();

    assert.assertEquals(text, "one two three");
    assert.assertEquals(opens, 1);
  },
);

nodeTest.test(
  "createLazyReadable cancel reaches an opened source",
  async () => {
    let cancelReason: unknown = null;
    const stream = webStreams.createLazyReadable(
      () =>
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(encoder.encode("chunk"));
          },
          cancel(reason) {
            cancelReason = reason;
          },
        }),
    );

    const reader = stream.getReader();
    await reader.read();
    await reader.cancel("done reading");

    assert.assertEquals(cancelReason, "done reading");
  },
);

nodeTest.test(
  "createLazyReadable cancel before a read leaves the source unopened",
  async () => {
    let opens = 0;
    const stream = webStreams.createLazyReadable(() => {
      opens++;
      return sourceOf("a");
    });

    await stream.cancel("not needed");

    assert.assertEquals(opens, 0);
  },
);

// =============================================================================
// createLazyWritable
// =============================================================================

const collectingSink = (): {
  readonly chunks: string[];
  readonly events: string[];
  readonly stream: WritableStream<Uint8Array>;
} => {
  const chunks: string[] = [];
  const events: string[] = [];
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(decoder.decode(chunk));
    },
    close() {
      events.push("close");
    },
    abort(reason) {
      events.push(`abort:${String(reason)}`);
    },
  });

  return { chunks, events, stream };
};

nodeTest.test(
  "createLazyWritable opens the sink on the first write",
  async () => {
    const sink = collectingSink();
    let opens = 0;
    const stream = webStreams.createLazyWritable(() => {
      opens++;
      return sink.stream;
    });

    const writer = stream.getWriter();
    assert.assertEquals(opens, 0);

    await writer.write(encoder.encode("first "));
    await writer.write(encoder.encode("second"));
    await writer.close();

    assert.assertEquals(opens, 1);
    assert.assertEquals(sink.chunks.join(""), "first second");
    assert.assertEquals(sink.events, ["close"]);
  },
);

nodeTest.test(
  "createLazyWritable close without a write leaves the sink unopened",
  async () => {
    let opens = 0;
    const stream = webStreams.createLazyWritable(() => {
      opens++;
      return collectingSink().stream;
    });

    await stream.close();

    assert.assertEquals(opens, 0);
  },
);

nodeTest.test("createLazyWritable abort reaches an opened sink", async () => {
  const sink = collectingSink();
  const stream = webStreams.createLazyWritable(() => sink.stream);

  const writer = stream.getWriter();
  await writer.write(encoder.encode("partial"));
  await writer.abort("stopped");

  assert.assertEquals(sink.events, ["abort:stopped"]);
});
