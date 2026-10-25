// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as webStreams from "./web-streams.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sourceOf = (...chunks: string[]): ReadableStream<Uint8Array> =>
  ReadableStream.from(chunks.map((chunk) => encoder.encode(chunk)));

// =============================================================================
// createLazyReadable
// =============================================================================

Deno.test("createLazyReadable does not open the source until a read", async () => {
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
});

Deno.test("createLazyReadable passes every chunk through, then closes", async () => {
  let opens = 0;
  const stream = webStreams.createLazyReadable(() => {
    opens++;
    return sourceOf("one ", "two ", "three");
  });

  const text = await new Response(stream).text();

  assert.assertEquals(text, "one two three");
  assert.assertEquals(opens, 1);
});

Deno.test("createLazyReadable cancel reaches an opened source", async () => {
  let cancelReason: unknown = null;
  const stream = webStreams.createLazyReadable(() =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode("chunk"));
      },
      cancel(reason) {
        cancelReason = reason;
      },
    })
  );

  const reader = stream.getReader();
  await reader.read();
  await reader.cancel("done reading");

  assert.assertEquals(cancelReason, "done reading");
});

Deno.test("createLazyReadable cancel before a read leaves the source unopened", async () => {
  let opens = 0;
  const stream = webStreams.createLazyReadable(() => {
    opens++;
    return sourceOf("a");
  });

  await stream.cancel("not needed");

  assert.assertEquals(opens, 0);
});

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

Deno.test("createLazyWritable opens the sink on the first write", async () => {
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
});

Deno.test("createLazyWritable close without a write leaves the sink unopened", async () => {
  let opens = 0;
  const stream = webStreams.createLazyWritable(() => {
    opens++;
    return collectingSink().stream;
  });

  await stream.close();

  assert.assertEquals(opens, 0);
});

Deno.test("createLazyWritable abort reaches an opened sink", async () => {
  const sink = collectingSink();
  const stream = webStreams.createLazyWritable(() => sink.stream);

  const writer = stream.getWriter();
  await writer.write(encoder.encode("partial"));
  await writer.abort("stopped");

  assert.assertEquals(sink.events, ["abort:stopped"]);
});

// =============================================================================
// createFileSinkWritable
// =============================================================================

const fakeFileSink = (): {
  readonly calls: string[];
  readonly sink: webStreams.FileSinkLike;
} => {
  const calls: string[] = [];
  const sink: webStreams.FileSinkLike = {
    write(chunk) {
      calls.push(`write:${decoder.decode(chunk)}`);
      return chunk.length;
    },
    flush() {
      calls.push("flush");
      return Promise.resolve(0);
    },
    end(error) {
      calls.push(error === undefined ? "end" : `end:${error.message}`);
      return 0;
    },
  };

  return { calls, sink };
};

Deno.test("createFileSinkWritable flushes each write and ends on close", async () => {
  const fake = fakeFileSink();
  const writer = webStreams.createFileSinkWritable(fake.sink).getWriter();

  await writer.write(encoder.encode("hello"));
  await writer.write(encoder.encode("world"));
  await writer.close();

  assert.assertEquals(fake.calls, [
    "write:hello",
    "flush",
    "write:world",
    "flush",
    "end",
  ]);
});

Deno.test("createFileSinkWritable abort ends the sink with the error", async () => {
  const fake = fakeFileSink();
  const writer = webStreams.createFileSinkWritable(fake.sink).getWriter();

  await writer.abort(new Error("parent gave up"));

  assert.assertEquals(fake.calls, ["end:parent gave up"]);
});

Deno.test("createFileSinkWritable abort with a non-error reason ends the sink", async () => {
  const fake = fakeFileSink();
  const writer = webStreams.createFileSinkWritable(fake.sink).getWriter();

  await writer.abort("cancelled");

  assert.assertEquals(fake.calls, ["end"]);
});

Deno.test("createFileSinkWritable rejects the write when the sink fails", async () => {
  const sink: webStreams.FileSinkLike = {
    write: () => Promise.reject(new Error("EPIPE: child closed its stdin")),
    flush: () => 0,
    end: () => 0,
  };
  const writer = webStreams.createFileSinkWritable(sink).getWriter();

  await assert.assertRejects(
    () => writer.write(encoder.encode("lost")),
    Error,
    "EPIPE",
  );
});
