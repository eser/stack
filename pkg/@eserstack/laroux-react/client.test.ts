// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for RSC Client Parser
 */

import { assertEquals, assertExists } from "@std/assert";
import { createFromReadableStream } from "./client.ts";
import { type RSCChunk, serializeChunk } from "./protocol.ts";

const TEST_STREAM_PROCESSING_DELAY_MS = 10;

Deno.test("RSC Client - Parse Simple JSON Stream", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: { message: "Hello" } },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertExists(result);
  assertEquals(result.message, "Hello");
});

Deno.test("RSC Client - Parse Multiple Chunks", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 1, value: "World" },
    { type: "J", id: 0, value: { ref: 1 } },
  ];

  const stream = createMockStream(chunks);
  const result = await createFromReadableStream(stream);

  assertExists(result);
});

Deno.test("RSC Client - Parse Array", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 1, value: "a" },
    { type: "J", id: 2, value: "b" },
    { type: "J", id: 0, value: [1, 2] },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertExists(result);
  assertEquals(Array.isArray(result), true);
});

Deno.test("RSC Client - Parse Primitive", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: "Hello, RSC!" },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertEquals(result, "Hello, RSC!");
});

Deno.test("RSC Client - Parse Null", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: null },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertEquals(result, null);
});

Deno.test("RSC Client - Parse Number", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: 42 },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertEquals(result, 42);
});

Deno.test("RSC Client - Parse Nested Object", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: { nested: { deep: { value: 123 } } } },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assertExists(result);
  assertEquals(result.nested.deep.value, 123);
});

// Helper function to create a mock ReadableStream from chunks
function createMockStream(chunks: RSCChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        const line = serializeChunk(chunks[index]);
        controller.enqueue(encoder.encode(line));
        index++;
      } else {
        controller.close();
      }
    },
  });
}
