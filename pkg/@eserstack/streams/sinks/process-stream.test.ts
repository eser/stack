// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as output from "../output.ts";
import type { Chunk, ErrorContext, Sink } from "../types.ts";
import * as processStream from "./process-stream.ts";

// Stands in for runtime.process.stdout: a byte stream whose writes complete on
// a later macrotask, so writes from two sinks overlap.
const createFakeProcessStream = () => {
  const decoder = new TextDecoder();
  const written: string[] = [];

  const stream = new WritableStream<Uint8Array>({
    async write(bytes) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      written.push(decoder.decode(bytes));
    },
  });

  return { stream, written };
};

// The same shape as sinks.stdout(), writing to the fake stream.
const processStreamSink = (stream: WritableStream<Uint8Array>): Sink => ({
  name: "fake-process-stream",
  writable: new WritableStream<Chunk>({
    async write(chunk) {
      await processStream.writeToProcessStream(stream, String(chunk.data));
    },
  }),
});

Deno.test("writeToProcessStream writes overlapping calls in call order", async () => {
  const fake = createFakeProcessStream();

  await Promise.all([
    processStream.writeToProcessStream(fake.stream, "a"),
    processStream.writeToProcessStream(fake.stream, "b"),
    processStream.writeToProcessStream(fake.stream, "c"),
  ]);

  assert.assertEquals(fake.written, ["a", "b", "c"]);
});

Deno.test("writeToProcessStream rejects a failed write and still runs the next", async () => {
  const fake = createFakeProcessStream();
  // Code outside the sinks holds the stream's writer, so this write fails.
  const external = fake.stream.getWriter();

  await assert.assertRejects(
    () => processStream.writeToProcessStream(fake.stream, "while locked"),
    TypeError,
  );

  external.releaseLock();
  await processStream.writeToProcessStream(fake.stream, "after release");

  assert.assertEquals(fake.written, ["after release"]);
});

Deno.test("two outputs on one process stream both reach it", async () => {
  // Two stdout() sinks used to take the stream's writer each, so the second
  // failed with "The stream is already locked" and dropped its chunks.
  const fake = createFakeProcessStream();
  const errors: ErrorContext[] = [];
  const onError = (context: ErrorContext) => {
    errors.push(context);
  };

  const first = output.output({
    sink: processStreamSink(fake.stream),
    onError,
  });
  const second = output.output({
    sink: processStreamSink(fake.stream),
    onError,
  });

  first.writeln("first 1");
  second.writeln("second 1");
  first.writeln("first 2");
  second.writeln("second 2");
  await Promise.all([first.close(), second.close()]);

  assert.assertEquals(errors, []);
  assert.assertEquals(fake.written.toSorted(), [
    "first 1\n",
    "first 2\n",
    "second 1\n",
    "second 2\n",
  ]);
  assert.assertEquals(
    fake.written.filter((line) => line.startsWith("first")),
    ["first 1\n", "first 2\n"],
  );
});
