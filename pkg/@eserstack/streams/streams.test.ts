// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as chunk from "./chunk.ts";
import * as defineLayer from "./define-layer.ts";
import * as output from "./output.ts";
import * as pipeline from "./pipeline.ts";
import * as types from "./types.ts";
import type { Chunk, ErrorContext } from "./types.ts";

// Sinks
import * as sinks from "./sinks/mod.ts";

// Sources
import * as events from "./sources/events.ts";
import * as values from "./sources/values.ts";

// Layers
import * as map from "./layers/map.ts";
import * as filter from "./layers/filter.ts";
import * as tap from "./layers/tap.ts";
import * as tee from "./layers/tee.ts";

// =============================================================================
// Chunk Tests
// =============================================================================

Deno.test("createChunk should create text chunk for strings", () => {
  const created = chunk.createChunk("hello");
  assert.assertEquals(created.data, "hello");
  assert.assertEquals(created.meta.kind, "text");
  assert.assertEquals(created.meta.channel, "stdout");
  assert.assertExists(created.meta.timestamp);
});

Deno.test("createChunk should create structured chunk for objects", () => {
  const created = chunk.createChunk({ name: "test" });
  assert.assertEquals(created.meta.kind, "structured");
});

Deno.test("createChunk should create bytes chunk for Uint8Array", () => {
  const created = chunk.createChunk(new Uint8Array([1, 2, 3]));
  assert.assertEquals(created.meta.kind, "bytes");
});

Deno.test("createChunk should handle null data", () => {
  const created = chunk.createChunk(null);
  assert.assertEquals(created.data, null);
  assert.assertEquals(created.meta.kind, "structured");
});

Deno.test("createChunk should handle undefined data", () => {
  const created = chunk.createChunk(undefined);
  assert.assertEquals(created.data, undefined);
  assert.assertEquals(created.meta.kind, "structured");
});

Deno.test("createChunk should accept meta overrides", () => {
  const created = chunk.createChunk("hello", { channel: "stderr" });
  assert.assertEquals(created.meta.channel, "stderr");
  assert.assertEquals(created.meta.kind, "text");
});

// =============================================================================
// defineLayer Tests
// =============================================================================

Deno.test("defineLayer should create a named layer", () => {
  const layer = defineLayer.defineLayer({
    name: "test-layer",
    create: () => ({
      transform(input, controller) {
        controller.enqueue(input);
      },
    }),
  });
  assert.assertEquals(layer.name, "test-layer");
  assert.assertExists(layer.transform);
});

Deno.test("defineLayer should produce a working TransformStream", async () => {
  const doubler = defineLayer.defineLayer<number, number>({
    name: "doubler",
    create: () => ({
      transform(input, controller) {
        controller.enqueue({ data: input.data * 2, meta: input.meta });
      },
    }),
  });

  // Test via pipeline (avoids manual stream lifecycle issues)
  const result = await pipeline.pipeline()
    .from(values.values(5))
    .through(doubler)
    .collect<number>();

  assert.assertEquals(result, [10]);
});

// =============================================================================
// Buffer Sink Tests
// =============================================================================

Deno.test("buffer sink should collect chunks", async () => {
  const buf = sinks.buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(chunk.createChunk("hello"));
  await writer.write(chunk.createChunk("world"));
  await writer.close();

  assert.assertEquals(buf.items().length, 2);
  assert.assertEquals(buf.items()[0], "hello");
  assert.assertEquals(buf.items()[1], "world");
});

Deno.test("buffer sink chunks() should include metadata", async () => {
  const buf = sinks.buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(chunk.createChunk("hello"));
  await writer.close();

  assert.assertEquals(buf.chunks()[0]!.meta.kind, "text");
});

Deno.test("buffer sink clear() should empty the collection", async () => {
  const buf = sinks.buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(chunk.createChunk("hello"));
  assert.assertEquals(buf.items().length, 1);

  buf.clear();
  assert.assertEquals(buf.items().length, 0);

  await writer.close();
});

// =============================================================================
// Null Sink Tests
// =============================================================================

Deno.test("null sink should accept and discard chunks", async () => {
  const sink = sinks.nullSink();
  const writer = sink.writable.getWriter();

  await writer.write(chunk.createChunk("discarded"));
  await writer.close();
  // No assertion needed — it didn't throw
});

// =============================================================================
// Multiplex Sink Tests
// =============================================================================

Deno.test("multiplex sink should write to all sinks", async () => {
  const buf1 = sinks.buffer<string>();
  const buf2 = sinks.buffer<string>();
  const mux = sinks.multiplex(buf1, buf2);

  const writer = mux.writable.getWriter();
  await writer.write(chunk.createChunk("hello"));
  await writer.write(chunk.createChunk("world"));
  await writer.close();

  assert.assertEquals(buf1.items().length, 2);
  assert.assertEquals(buf2.items().length, 2);
  assert.assertEquals(buf1.items()[0], "hello");
  assert.assertEquals(buf2.items()[1], "world");
});

// =============================================================================
// Values Source Tests
// =============================================================================

Deno.test("values source should emit all items", async () => {
  const source = values.values("a", "b", "c");

  const emitted = await Array.fromAsync(source.readable);
  const results = emitted.map((item) => item.data as string);

  assert.assertEquals(results, ["a", "b", "c"]);
});

Deno.test("values source should handle empty input", async () => {
  const source = values.values();
  const reader = source.readable.getReader();

  const { done } = await reader.read();
  assert.assertEquals(done, true);
});

// =============================================================================
// Events Source Tests
// =============================================================================

Deno.test("events source emits the detail of each CustomEvent", async () => {
  const target = new EventTarget();
  const source = events.events<string>(target, "message");
  const reader = source.readable.getReader();

  target.dispatchEvent(new CustomEvent("message", { detail: "first" }));
  target.dispatchEvent(new CustomEvent("message", { detail: "second" }));

  const first = await reader.read();
  const second = await reader.read();
  await reader.cancel();

  assert.assertEquals(first.value?.data, "first");
  assert.assertEquals(second.value?.data, "second");
});

Deno.test("events source removes its listener when the stream is cancelled", async () => {
  const removed: string[] = [];
  const target = new EventTarget();
  const removeEventListener = target.removeEventListener.bind(target);
  target.removeEventListener = (type, listener, options) => {
    removed.push(type);
    removeEventListener(type, listener, options);
  };

  const source = events.events(target, "message");
  const reader = source.readable.getReader();
  await reader.cancel();

  assert.assertEquals(removed, ["message"]);
});

// =============================================================================
// Layer Tests — map
// =============================================================================

Deno.test("map layer should transform chunk data", async () => {
  const result = await pipeline.pipeline()
    .from(values.values(1, 2, 3))
    .through(map.map((n: number) => n * 10))
    .collect<number>();

  assert.assertEquals(result, [10, 20, 30]);
});

// =============================================================================
// Layer Tests — filter
// =============================================================================

Deno.test("filter layer should drop non-matching chunks", async () => {
  const result = await pipeline.pipeline()
    .from(values.values(1, 2, 3, 4, 5))
    .through(filter.filter((n: number) => n > 3))
    .collect<number>();

  assert.assertEquals(result, [4, 5]);
});

Deno.test("filter layer should pass all if predicate always true", async () => {
  const result = await pipeline.pipeline()
    .from(values.values("a", "b"))
    .through(filter.filter(() => true))
    .collect<string>();

  assert.assertEquals(result, ["a", "b"]);
});

// =============================================================================
// Layer Tests — tap
// =============================================================================

Deno.test("tap layer should call side-effect without modifying chunk", async () => {
  const observed: string[] = [];

  const result = await pipeline.pipeline()
    .from(values.values("hello", "world"))
    .through(tap.tap((item: Chunk<string>) => {
      observed.push(item.data);
    }))
    .collect<string>();

  assert.assertEquals(result, ["hello", "world"]);
  assert.assertEquals(observed, ["hello", "world"]);
});

// =============================================================================
// Layer Tests — tee
// =============================================================================

Deno.test("tee layer should send to extra sink and pass through", async () => {
  const teeBuf = sinks.buffer<string>();

  const result = await pipeline.pipeline()
    .from(values.values("a", "b", "c"))
    .through(tee.tee(teeBuf))
    .collect<string>();

  assert.assertEquals(result, ["a", "b", "c"]);
  assert.assertEquals(teeBuf.items(), ["a", "b", "c"]);
});

// =============================================================================
// Pipeline Tests
// =============================================================================

Deno.test("pipeline should chain from → through → to → run", async () => {
  const buf = sinks.buffer<number>();

  await pipeline.pipeline()
    .from(values.values(1, 2, 3))
    .through(map.map((n: number) => n + 100))
    .to(buf)
    .run();

  assert.assertEquals(buf.items(), [101, 102, 103]);
});

Deno.test("pipeline collect() should return data array", async () => {
  const result = await pipeline.pipeline()
    .from(values.values("x", "y"))
    .collect<string>();

  assert.assertEquals(result, ["x", "y"]);
});

Deno.test("pipeline should handle empty source", async () => {
  const result = await pipeline.pipeline()
    .from(values.values())
    .collect();

  assert.assertEquals(result, []);
});

Deno.test("pipeline should throw PipelineError with no source", async () => {
  await assert.assertRejects(
    () => pipeline.pipeline().to(sinks.buffer()).run(),
    types.PipelineError,
    "no source",
  );
});

Deno.test("pipeline should throw PipelineError with no sink", async () => {
  await assert.assertRejects(
    () => pipeline.pipeline().from(values.values(1)).run(),
    types.PipelineError,
    "no sink",
  );
});

Deno.test("pipeline should support multiple layers", async () => {
  const result = await pipeline.pipeline()
    .from(values.values(1, 2, 3, 4, 5))
    .through(
      filter.filter((n: number) => n % 2 === 0),
      map.map((n: number) => n * 10),
    )
    .collect<number>();

  assert.assertEquals(result, [20, 40]);
});

Deno.test("pipeline should propagate layer errors", async () => {
  const failLayer = defineLayer.defineLayer({
    name: "fail",
    create: () => ({
      transform(_chunk, _controller) {
        throw new Error("intentional failure");
      },
    }),
  });

  await assert.assertRejects(
    () =>
      pipeline.pipeline()
        .from(values.values("test"))
        .through(failLayer)
        .to(sinks.nullSink())
        .run(),
    types.PipelineError,
  );
});

Deno.test({
  name: "pipeline timeout should reject with TimeoutError",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Use a slow layer that delays longer than the timeout
    const slowLayer = defineLayer.defineLayer({
      name: "slow",
      create: () => ({
        transform(_chunk, _controller) {
          return new Promise((resolve) => setTimeout(resolve, 10000));
        },
      }),
    });

    await assert.assertRejects(
      () =>
        pipeline.pipeline()
          .from(values.values("test"))
          .through(slowLayer)
          .to(sinks.nullSink())
          .run({ timeout: 50 }),
      Error,
    );
  },
});

// =============================================================================
// Output Tests
// =============================================================================

Deno.test("output write() should enqueue to sink via buffer", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  out.write("hello");
  out.write("world");
  await out.flush();

  assert.assertEquals(buf.items().length, 2);
});

Deno.test("output writeln() should append newline", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  out.writeln("hello");
  await out.flush();

  assert.assertEquals(buf.items()[0], "hello\n");
});

Deno.test("output flush() on empty buffer should be no-op", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  await out.flush(); // Should not throw
  assert.assertEquals(buf.items().length, 0);
});

Deno.test("output close() should flush and close", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  out.write("data");
  await out.close();

  assert.assertEquals(buf.items().length, 1);
});

Deno.test("output with layers should transform data", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({
    sink: buf,
    layers: [map.map((s: unknown) => `[${String(s)}]`)],
  });

  out.write("test");
  await out.flush();

  assert.assertEquals(buf.items()[0], "[test]");
});

Deno.test({
  name: "output error handler should receive context",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let receivedContext: ErrorContext | undefined;

    const failLayer = defineLayer.defineLayer({
      name: "fail",
      create: () => ({
        transform(_chunk, _controller) {
          throw new Error("boom");
        },
      }),
    });

    const out = output.output({
      sink: sinks.buffer(),
      layers: [failLayer],
      onError: (ctx) => {
        receivedContext = ctx;
      },
    });

    out.write("trigger");
    await out.flush();

    // Give async error propagation time to fire
    await new Promise((r) => setTimeout(r, 100));

    assert.assertExists(receivedContext);
    assert.assertExists(receivedContext!.error);
  },
});

Deno.test("output pipe() should return a new independent output", () => {
  const out = output.output();
  const piped = out.pipe(map.map((s: unknown) => `[${String(s)}]`));

  // pipe() returns a new Output (not the same reference)
  assert.assertNotEquals(out, piped);
});

// A stalled drain leaves the promise pending with nothing else in the event
// loop, so the bound turns that into a test failure with a message instead of
// a runner abort.
const STALL_BOUND_MS = 1_000;

const resolvesWithin = async (
  promise: Promise<void>,
  label: string,
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`${label} did not resolve in ${STALL_BOUND_MS}ms`)),
      STALL_BOUND_MS,
    );
  });
  try {
    await Promise.race([promise, stalled]);
  } finally {
    clearTimeout(timer);
  }
};

// A sink whose writes wait on a gate, so a test can hold a write in flight.
const createGatedSink = () => {
  const written: unknown[] = [];
  const firstWriteStarted = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();

  const sink = sinks.writable(
    new WritableStream<Chunk>({
      async write(gatedChunk) {
        firstWriteStarted.resolve();
        await gate.promise;
        written.push(gatedChunk.data);
      },
    }),
    "gated",
  );

  return {
    sink,
    written,
    firstWriteStarted: firstWriteStarted.promise,
    open: () => gate.resolve(),
  };
};

Deno.test("output writes a chunk enqueued after a drain that overlapped another write", async () => {
  // TASK-160: a writeln during an in-flight sink write scheduled a drain that
  // skipped because one was running, and that skipped drain left the
  // "scheduled" flag set. Every chunk after the running drain finished stayed
  // in the buffer, and close() never resolved. Synchronous FFI work between
  // writes made this timing common in CLI runs.
  const gated = createGatedSink();
  const out = output.output({ sink: gated.sink });

  out.writeln("first");
  await gated.firstWriteStarted;

  out.writeln("second, enqueued while the first write is in flight");
  // Gives any drain the second writeln scheduled the chance to run while the
  // first write still waits on the gate.
  await new Promise((resolve) => setTimeout(resolve, 0));

  gated.open();
  await resolvesWithin(out.flush(), "flush after the overlapping write");

  out.writeln("third, enqueued after the drain finished");
  await resolvesWithin(out.close(), "close after the later write");

  assert.assertEquals(gated.written, [
    "first\n",
    "second, enqueued while the first write is in flight\n",
    "third, enqueued after the drain finished\n",
  ]);
});

Deno.test("output resolves every flush() waiting on the same drain", async () => {
  const gated = createGatedSink();
  const out = output.output({ sink: gated.sink });

  out.writeln("line");
  const firstFlush = out.flush();
  const secondFlush = out.flush();
  gated.open();

  await resolvesWithin(
    Promise.all([firstFlush, secondFlush]).then(() => {}),
    "two concurrent flushes",
  );
  assert.assertEquals(gated.written, ["line\n"]);
});

// =============================================================================
// Coverage Gap Tests — edge cases from eng review
// =============================================================================

Deno.test("output write after close should be ignored", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  out.write("before");
  await out.close();
  out.write("after"); // should be silently ignored
  await new Promise((r) => setTimeout(r, 20));

  assert.assertEquals(buf.items().length, 1);
  assert.assertEquals(buf.items()[0], "before");
});

Deno.test("output write() with multiple args renders to single chunk", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  out.write("a", "b", "c");
  await out.flush();

  // Multiple string args are normalized to Spans and rendered as one chunk
  assert.assertEquals(buf.items().length, 1);
  assert.assertEquals(buf.items()[0], "abc");
});

Deno.test("defineLayer with start and flush callbacks", async () => {
  const events: string[] = [];

  const traced = defineLayer.defineLayer({
    name: "traced",
    create: () => ({
      start() {
        events.push("start");
      },
      transform(input, controller) {
        events.push("transform");
        controller.enqueue(input);
      },
      flush() {
        events.push("flush");
      },
    }),
  });

  await pipeline.pipeline()
    .from(values.values("x"))
    .through(traced)
    .to(sinks.nullSink())
    .run();

  assert.assertEquals(events, ["start", "transform", "flush"]);
});

Deno.test("pipeline with zero layers (source → sink directly)", async () => {
  const result = await pipeline.pipeline()
    .from(values.values(42))
    .collect<number>();

  assert.assertEquals(result, [42]);
});

Deno.test("multiplex sink close() should close all sinks", async () => {
  const buf1 = sinks.buffer<string>();
  const buf2 = sinks.buffer<string>();
  const mux = sinks.multiplex(buf1, buf2);

  const writer = mux.writable.getWriter();
  await writer.write(chunk.createChunk("data"));
  await writer.close();

  // Both sinks should have received the data
  assert.assertEquals(buf1.items().length, 1);
  assert.assertEquals(buf2.items().length, 1);
});

// =============================================================================
// Integration Tests — multi-layer pipelines
// =============================================================================

Deno.test("integration: values → filter → map → tap → buffer", async () => {
  const tapped: number[] = [];

  const result = await pipeline.pipeline()
    .from(values.values(1, 2, 3, 4, 5, 6))
    .through(
      filter.filter((n: number) => n % 2 === 0),
      map.map((n: number) => n * 100),
      tap.tap((item: Chunk<number>) => {
        tapped.push(item.data);
      }),
    )
    .collect<number>();

  assert.assertEquals(result, [200, 400, 600]);
  assert.assertEquals(tapped, [200, 400, 600]);
});

Deno.test("integration: values → tee → map → buffer", async () => {
  const teeBuf = sinks.buffer<number>();

  const result = await pipeline.pipeline()
    .from(values.values(10, 20, 30))
    .through(
      tee.tee(teeBuf),
      map.map((n: number) => n + 1),
    )
    .collect<number>();

  // tee gets original values, collect gets mapped
  assert.assertEquals(teeBuf.items(), [10, 20, 30]);
  assert.assertEquals(result, [11, 21, 31]);
});

Deno.test("integration: tight write loop should not crash", async () => {
  const buf = sinks.buffer<unknown>();
  const out = output.output({ sink: buf });

  for (let i = 0; i < 1000; i++) {
    out.write(String(i));
  }

  await out.flush();
  assert.assertEquals(buf.items().length, 1000);
});
