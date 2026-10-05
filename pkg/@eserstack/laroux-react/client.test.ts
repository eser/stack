// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for RSC Client Parser
 */

import * as assert from "@std/assert";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";
import * as client from "./client.ts";
import * as protocol from "./protocol.ts";
import type { RSCChunk } from "./protocol.ts";

const TEST_STREAM_PROCESSING_DELAY_MS = 10;

Deno.test("RSC Client - Parse Simple JSON Stream", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: { message: "Hello" } },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertExists(result);
  assert.assertEquals(result.message, "Hello");
});

Deno.test("RSC Client - Parse Multiple Chunks", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 1, value: "World" },
    { type: "J", id: 0, value: { ref: 1 } },
  ];

  const stream = createMockStream(chunks);
  const result = await client.createFromReadableStream(stream);

  assert.assertExists(result);
});

Deno.test("RSC Client - Parse Array", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 1, value: "a" },
    { type: "J", id: 2, value: "b" },
    { type: "J", id: 0, value: [1, 2] },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertExists(result);
  assert.assertEquals(Array.isArray(result), true);
});

Deno.test("RSC Client - Parse Primitive", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: "Hello, RSC!" },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertEquals(result, "Hello, RSC!");
});

Deno.test("RSC Client - Parse Null", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: null },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertEquals(result, null);
});

Deno.test("RSC Client - Parse Number", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: 42 },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertEquals(result, 42);
});

Deno.test("RSC Client - Parse Nested Object", async () => {
  const chunks: RSCChunk[] = [
    { type: "J", id: 0, value: { nested: { deep: { value: 123 } } } },
  ];

  const stream = createMockStream(chunks);
  const RSCTreeRoot = await client.createFromReadableStream(stream);

  // Wait for stream processing to complete
  await new Promise((resolve) =>
    setTimeout(resolve, TEST_STREAM_PROCESSING_DELAY_MS)
  );

  const result = RSCTreeRoot();

  assert.assertExists(result);
  assert.assertEquals(result.nested.deep.value, 123);
});

// Helper function to create a mock ReadableStream from chunks
function createMockStream(chunks: RSCChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[index];
      if (chunk === undefined) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(protocol.serializeChunk(chunk)));
      index++;
    },
  });
}

// ============================================================================
// Stream failures
// ============================================================================

/** Let every queued microtask run, so the client applies what it was sent. */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** A stream the test feeds line by line and then closes or fails. */
function createControlledStream(): {
  stream: ReadableStream<Uint8Array>;
  send: (chunk: RSCChunk) => void;
  close: () => void;
  fail: (error: Error) => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  const requireController = () => {
    if (controller === null) {
      throw new Error("the test stream has not started");
    }
    return controller;
  };

  return {
    stream,
    send: (chunk) =>
      requireController().enqueue(
        encoder.encode(protocol.serializeChunk(chunk)),
      ),
    close: () => requireController().close(),
    fail: (error) => requireController().error(error),
  };
}

/**
 * Chunks of a Suspense boundary whose content (chunk 2) is a forward
 * reference that has not arrived yet.
 */
const SUSPENSE_WITH_FORWARD_REFERENCE: RSCChunk[] = [
  { type: "J", id: 1, value: { fallback: "Loading", children: "$2" } },
  {
    type: "J",
    id: 0,
    value: {
      $$typeof: "react.element",
      type: "Symbol(react.suspense)",
      props: "$1",
    },
  },
];

/** The ChunkReader element the client puts inside a pending boundary. */
// The element tree comes from the RSC parser, which returns it untyped.
// deno-lint-ignore no-explicit-any
function findChunkReader(boundary: any): {
  // deno-lint-ignore no-explicit-any
  read: () => any;
} {
  const reader = boundary.props.children;
  return { read: () => reader.type(reader.props) };
}

/**
 * The two ways the browser reads a stream: createFromReadableStream, and
 * createHybridRSCTree, which takes the stream as a /rsc response body.
 */
const STREAM_ENTRY_POINTS = [
  {
    name: "createFromReadableStream",
    // Both entry points return Promise<any>, the untyped root component.
    // deno-lint-ignore no-explicit-any
    create: (stream: ReadableStream<Uint8Array>): Promise<any> =>
      client.createFromReadableStream(stream),
  },
  {
    name: "createHybridRSCTree",
    // Same untyped root component as above.
    // deno-lint-ignore no-explicit-any
    create: (stream: ReadableStream<Uint8Array>): Promise<any> =>
      client.createHybridRSCTree(null, Promise.resolve(new Response(stream))),
  },
];

for (const entryPoint of STREAM_ENTRY_POINTS) {
  Deno.test(`RSC Client - ${entryPoint.name} rejects pending chunks when the stream fails`, async () => {
    const feed = createControlledStream();
    const RSCTreeRoot = await entryPoint.create(feed.stream);
    for (const chunk of SUSPENSE_WITH_FORWARD_REFERENCE) {
      feed.send(chunk);
    }
    await flushMicrotasks();

    const reader = findChunkReader(RSCTreeRoot());

    // React suspends on the chunk it is thrown and waits on its listeners.
    // The thrown chunk is an internal thenable the client does not export.
    // deno-lint-ignore no-explicit-any
    let suspendedOn: any = null;
    try {
      reader.read();
    } catch (thrown) {
      suspendedOn = thrown;
    }
    assert.assertExists(suspendedOn);
    const settled = new Promise((resolve, reject) => {
      suspendedOn.then(resolve, reject);
    });

    const failure = new Error("connection reset");
    feed.fail(failure);

    const reason = await assert.assertRejects(() => settled);
    assert.assertStrictEquals(reason, failure);
    // The retried render now throws the stream's error for the boundary.
    assert.assertThrows(() => reader.read(), Error, "connection reset");
  });
}

Deno.test("RSC Client - a stream error after a forward reference reaches the Suspense boundary", async () => {
  const feed = createControlledStream();
  const RSCTreeRoot = await client.createFromReadableStream(feed.stream);
  for (const chunk of SUSPENSE_WITH_FORWARD_REFERENCE) {
    feed.send(chunk);
  }
  await flushMicrotasks();

  const renderErrors: unknown[] = [];
  const html = await ReactDOMServer.renderToReadableStream(
    React.createElement(RSCTreeRoot),
    { onError: (error: unknown) => void renderErrors.push(error) },
  );

  feed.fail(new Error("connection reset"));

  // Without the rejection the boundary waits forever, so bound the wait.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timed out">((resolve) => {
    timer = setTimeout(() => resolve("timed out"), 2000);
  });
  const outcome = await Promise.race([
    html.allReady.then(() => "ready" as const),
    timedOut,
  ]);
  clearTimeout(timer);
  assert.assertEquals(outcome, "ready");

  const markup = await new Response(html).text();
  // The boundary keeps its fallback and is marked as failed, which hands it
  // to the client renderer and the error boundary above it.
  assert.assertStringIncludes(markup, "Loading");
  assert.assertStringIncludes(markup, "<!--$!-->");
  assert.assertEquals(renderErrors.length, 1);
  assert.assertInstanceOf(renderErrors[0], Error);
  assert.assertEquals((renderErrors[0] as Error).message, "connection reset");
});

Deno.test("RSC Client - the root fails when the stream fails before chunk 0 arrives", async () => {
  const feed = createControlledStream();
  const RSCTreeRoot = await client.createFromReadableStream(feed.stream);

  // The thrown chunk is an internal thenable the client does not export.
  // deno-lint-ignore no-explicit-any
  let suspendedOn: any = null;
  try {
    RSCTreeRoot();
  } catch (thrown) {
    suspendedOn = thrown;
  }
  assert.assertExists(suspendedOn);
  const settled = new Promise((resolve, reject) => {
    suspendedOn.then(resolve, reject);
  });

  feed.fail(new Error("connection reset"));

  await assert.assertRejects(() => settled, Error, "connection reset");
  assert.assertThrows(() => RSCTreeRoot(), Error, "connection reset");
});

Deno.test("RSC Client - a stream that ends without a referenced chunk fails that chunk", async () => {
  const feed = createControlledStream();
  const RSCTreeRoot = await client.createFromReadableStream(feed.stream);
  for (const chunk of SUSPENSE_WITH_FORWARD_REFERENCE) {
    feed.send(chunk);
  }
  await flushMicrotasks();
  const reader = findChunkReader(RSCTreeRoot());

  feed.close();
  await flushMicrotasks();

  assert.assertThrows(
    () => reader.read(),
    Error,
    "the stream ended before chunk 2 arrived",
  );
});

Deno.test("RSC Client - createHybridRSCTree fails the root when /rsc answers with an error", async () => {
  const RSCTreeRoot = await client.createHybridRSCTree(
    null,
    Promise.resolve(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    ),
  );
  await flushMicrotasks();

  assert.assertThrows(() => RSCTreeRoot(), Error, "503 Service Unavailable");
});

Deno.test("RSC Client - a client module that fails to load fails only its chunk", async () => {
  const feed = createControlledStream();
  const loadError = new Error("chunk-missing.js is not in the build");
  const valuePromise = client.createValueFromReadableStream(
    feed.stream,
    () => Promise.reject(loadError),
  );

  feed.send({
    type: "M",
    id: 1,
    value: { id: "./missing.tsx", chunks: [], name: "Missing" },
  });
  feed.send({ type: "J", id: 2, value: "$M1" });
  feed.send({ type: "J", id: 0, value: "after the failed module" });
  feed.close();

  // The stream goes on after the failed load, so chunk 0 still arrives.
  assert.assertEquals(await valuePromise, "after the failed module");
});

// ============================================================================
// Values (server action results)
// ============================================================================

const decodeValue = (chunks: RSCChunk[]): Promise<unknown> =>
  client.createValueFromReadableStream(createMockStream(chunks));

const VALUE_CASES: {
  name: string;
  chunks: RSCChunk[];
  expected: unknown;
}[] = [
  {
    name: "a Date",
    chunks: [{ type: "J", id: 0, value: "$D2026-01-02T03:04:05.000Z" }],
    expected: new Date("2026-01-02T03:04:05.000Z"),
  },
  {
    name: "a Map from its entries chunk",
    chunks: [
      { type: "J", id: 1, value: [["views", 3], ["seen", "$D2026-01-02"]] },
      { type: "J", id: 0, value: "$Q1" },
    ],
    expected: new Map<string, unknown>([
      ["views", 3],
      ["seen", new Date("2026-01-02")],
    ]),
  },
  {
    name: "a Set from its values chunk",
    chunks: [
      { type: "J", id: 1, value: ["a", "b"] },
      { type: "J", id: 0, value: "$W1" },
    ],
    expected: new Set(["a", "b"]),
  },
  {
    name: "numbers and values JSON cannot hold",
    chunks: [{
      type: "J",
      id: 0,
      value: {
        big: "$n12345678901234567890",
        missing: "$undefined",
        nan: "$NaN",
        infinity: "$Infinity",
        negativeInfinity: "$-Infinity",
        negativeZero: "$-0",
      },
    }],
    expected: {
      big: 12345678901234567890n,
      missing: undefined,
      nan: NaN,
      infinity: Infinity,
      negativeInfinity: -Infinity,
      negativeZero: -0,
    },
  },
  {
    name: "strings the server escaped because they start with $",
    chunks: [{ type: "J", id: 0, value: ["$$5", "$$$$", "$$D2026"] }],
    expected: ["$5", "$$$", "$D2026"],
  },
  {
    name: "a value whose parts arrive after chunk 0",
    chunks: [
      { type: "J", id: 0, value: { title: "$1", tags: "$W2" } },
      { type: "J", id: 1, value: "Saved" },
      { type: "J", id: 2, value: ["news"] },
    ],
    expected: { title: "Saved", tags: new Set(["news"]) },
  },
];

for (const { name, chunks, expected } of VALUE_CASES) {
  Deno.test(`RSC Client - createValueFromReadableStream decodes ${name}`, async () => {
    assert.assertEquals(await decodeValue(chunks), expected);
  });
}

Deno.test("RSC Client - a __proto__ key in the stream stays a plain property", async () => {
  const value = await decodeValue([
    { type: "J", id: 0, value: JSON.parse('{"__proto__":{"admin":true}}') },
  ]) as Record<string, unknown>;

  assert.assertEquals(Object.getPrototypeOf(value), Object.prototype);
  assert.assertEquals(value["admin"], undefined);
  assert.assertEquals(Object.keys(value), ["__proto__"]);
});

Deno.test("RSC Client - a Suspense boundary keeps text that starts with $", async () => {
  const RSCTreeRoot = await client.createFromReadableStream(createMockStream([
    { type: "J", id: 1, value: { fallback: "Loading", children: "$$5 off" } },
    {
      type: "J",
      id: 0,
      value: {
        $$typeof: "react.element",
        type: "Symbol(react.suspense)",
        props: "$1",
      },
    },
  ]));
  await flushMicrotasks();

  const boundary = RSCTreeRoot() as React.ReactElement<{ children: string }>;
  assert.assertEquals(boundary.type, React.Suspense);
  assert.assertEquals(boundary.props.children, "$5 off");
});

Deno.test("RSC Client - createValueFromReadableStream decodes a React element", async () => {
  const value = await decodeValue([
    { type: "J", id: 1, value: { className: "notice", children: "$$5 off" } },
    {
      type: "J",
      id: 0,
      value: { $$typeof: "react.element", type: "p", props: "$1" },
    },
  ]);

  assert.assertEquals(React.isValidElement(value), true);
  const element = value as React.ReactElement<
    { className: string; children: string }
  >;
  assert.assertEquals(element.type, "p");
  assert.assertEquals(element.props.className, "notice");
  assert.assertEquals(element.props.children, "$5 off");
});

Deno.test("RSC Client - createValueFromReadableStream rejects with an error chunk", async () => {
  await assert.assertRejects(
    () =>
      decodeValue([{
        type: "E",
        id: 0,
        value: { message: "encode server action result: unsupported value" },
      }]),
    Error,
    "unsupported value",
  );
});

Deno.test("RSC Client - createValueFromReadableStream rejects when the stream fails first", async () => {
  const feed = createControlledStream();
  const valuePromise = client.createValueFromReadableStream(feed.stream);

  feed.send({ type: "J", id: 0, value: { title: "$1" } });
  await flushMicrotasks();
  feed.fail(new Error("connection reset"));

  await assert.assertRejects(() => valuePromise, Error, "connection reset");
});
