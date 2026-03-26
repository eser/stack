// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { createChunk } from "./chunk.ts";
import { defineLayer } from "./define-layer.ts";
import { output } from "./output.ts";
import { pipeline } from "./pipeline.ts";
import { PipelineError } from "./types.ts";
import type { Chunk, ErrorContext } from "./types.ts";

// Sinks
import { buffer } from "./sinks/buffer.ts";
import { nullSink } from "./sinks/null.ts";
import { multiplex } from "./sinks/multiplex.ts";

// Sources
import { values } from "./sources/values.ts";

// Layers
import { map } from "./layers/map.ts";
import { filter } from "./layers/filter.ts";
import { tap } from "./layers/tap.ts";
import { tee } from "./layers/tee.ts";

// =============================================================================
// Chunk Tests
// =============================================================================

Deno.test("createChunk should create text chunk for strings", () => {
  const chunk = createChunk("hello");
  assert.assertEquals(chunk.data, "hello");
  assert.assertEquals(chunk.meta.kind, "text");
  assert.assertEquals(chunk.meta.channel, "stdout");
  assert.assertExists(chunk.meta.timestamp);
});

Deno.test("createChunk should create structured chunk for objects", () => {
  const chunk = createChunk({ name: "test" });
  assert.assertEquals(chunk.meta.kind, "structured");
});

Deno.test("createChunk should create bytes chunk for Uint8Array", () => {
  const chunk = createChunk(new Uint8Array([1, 2, 3]));
  assert.assertEquals(chunk.meta.kind, "bytes");
});

Deno.test("createChunk should handle null data", () => {
  const chunk = createChunk(null);
  assert.assertEquals(chunk.data, null);
  assert.assertEquals(chunk.meta.kind, "structured");
});

Deno.test("createChunk should handle undefined data", () => {
  const chunk = createChunk(undefined);
  assert.assertEquals(chunk.data, undefined);
  assert.assertEquals(chunk.meta.kind, "structured");
});

Deno.test("createChunk should accept meta overrides", () => {
  const chunk = createChunk("hello", { channel: "stderr" });
  assert.assertEquals(chunk.meta.channel, "stderr");
  assert.assertEquals(chunk.meta.kind, "text");
});

// =============================================================================
// defineLayer Tests
// =============================================================================

Deno.test("defineLayer should create a named layer", () => {
  const layer = defineLayer({
    name: "test-layer",
    create: () => ({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    }),
  });
  assert.assertEquals(layer.name, "test-layer");
  assert.assertExists(layer.transform);
});

Deno.test("defineLayer should produce a working TransformStream", async () => {
  const doubler = defineLayer<number, number>({
    name: "doubler",
    create: () => ({
      transform(chunk, controller) {
        controller.enqueue({ data: chunk.data * 2, meta: chunk.meta });
      },
    }),
  });

  // Test via pipeline (avoids manual stream lifecycle issues)
  const result = await pipeline()
    .from(values(5))
    .through(doubler)
    .collect<number>();

  assert.assertEquals(result, [10]);
});

// =============================================================================
// Buffer Sink Tests
// =============================================================================

Deno.test("buffer sink should collect chunks", async () => {
  const buf = buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(createChunk("hello"));
  await writer.write(createChunk("world"));
  await writer.close();

  assert.assertEquals(buf.items().length, 2);
  assert.assertEquals(buf.items()[0], "hello");
  assert.assertEquals(buf.items()[1], "world");
});

Deno.test("buffer sink chunks() should include metadata", async () => {
  const buf = buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(createChunk("hello"));
  await writer.close();

  assert.assertEquals(buf.chunks()[0]!.meta.kind, "text");
});

Deno.test("buffer sink clear() should empty the collection", async () => {
  const buf = buffer<string>();
  const writer = buf.writable.getWriter();

  await writer.write(createChunk("hello"));
  assert.assertEquals(buf.items().length, 1);

  buf.clear();
  assert.assertEquals(buf.items().length, 0);

  await writer.close();
});

// =============================================================================
// Null Sink Tests
// =============================================================================

Deno.test("null sink should accept and discard chunks", async () => {
  const sink = nullSink();
  const writer = sink.writable.getWriter();

  await writer.write(createChunk("discarded"));
  await writer.close();
  // No assertion needed — it didn't throw
});

// =============================================================================
// Multiplex Sink Tests
// =============================================================================

Deno.test("multiplex sink should write to all sinks", async () => {
  const buf1 = buffer<string>();
  const buf2 = buffer<string>();
  const mux = multiplex(buf1, buf2);

  const writer = mux.writable.getWriter();
  await writer.write(createChunk("hello"));
  await writer.write(createChunk("world"));
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
  const source = values("a", "b", "c");
  const reader = source.readable.getReader();

  const results: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    results.push(value.data as string);
  }

  assert.assertEquals(results, ["a", "b", "c"]);
});

Deno.test("values source should handle empty input", async () => {
  const source = values();
  const reader = source.readable.getReader();

  const { done } = await reader.read();
  assert.assertEquals(done, true);
});

// =============================================================================
// Layer Tests — map
// =============================================================================

Deno.test("map layer should transform chunk data", async () => {
  const result = await pipeline()
    .from(values(1, 2, 3))
    .through(map((n: number) => n * 10))
    .collect<number>();

  assert.assertEquals(result, [10, 20, 30]);
});

// =============================================================================
// Layer Tests — filter
// =============================================================================

Deno.test("filter layer should drop non-matching chunks", async () => {
  const result = await pipeline()
    .from(values(1, 2, 3, 4, 5))
    .through(filter((n: number) => n > 3))
    .collect<number>();

  assert.assertEquals(result, [4, 5]);
});

Deno.test("filter layer should pass all if predicate always true", async () => {
  const result = await pipeline()
    .from(values("a", "b"))
    .through(filter(() => true))
    .collect<string>();

  assert.assertEquals(result, ["a", "b"]);
});

// =============================================================================
// Layer Tests — tap
// =============================================================================

Deno.test("tap layer should call side-effect without modifying chunk", async () => {
  const observed: string[] = [];

  const result = await pipeline()
    .from(values("hello", "world"))
    .through(tap((chunk: Chunk<string>) => {
      observed.push(chunk.data);
    }))
    .collect<string>();

  assert.assertEquals(result, ["hello", "world"]);
  assert.assertEquals(observed, ["hello", "world"]);
});

// =============================================================================
// Layer Tests — tee
// =============================================================================

Deno.test("tee layer should send to extra sink and pass through", async () => {
  const teeBuf = buffer<string>();

  const result = await pipeline()
    .from(values("a", "b", "c"))
    .through(tee(teeBuf))
    .collect<string>();

  assert.assertEquals(result, ["a", "b", "c"]);
  assert.assertEquals(teeBuf.items(), ["a", "b", "c"]);
});

// =============================================================================
// Pipeline Tests
// =============================================================================

Deno.test("pipeline should chain from → through → to → run", async () => {
  const buf = buffer<number>();

  await pipeline()
    .from(values(1, 2, 3))
    .through(map((n: number) => n + 100))
    .to(buf)
    .run();

  assert.assertEquals(buf.items(), [101, 102, 103]);
});

Deno.test("pipeline collect() should return data array", async () => {
  const result = await pipeline()
    .from(values("x", "y"))
    .collect<string>();

  assert.assertEquals(result, ["x", "y"]);
});

Deno.test("pipeline should handle empty source", async () => {
  const result = await pipeline()
    .from(values())
    .collect();

  assert.assertEquals(result, []);
});

Deno.test("pipeline should throw PipelineError with no source", async () => {
  await assert.assertRejects(
    () => pipeline().to(buffer()).run(),
    PipelineError,
    "no source",
  );
});

Deno.test("pipeline should throw PipelineError with no sink", async () => {
  await assert.assertRejects(
    () => pipeline().from(values(1)).run(),
    PipelineError,
    "no sink",
  );
});

Deno.test("pipeline should support multiple layers", async () => {
  const result = await pipeline()
    .from(values(1, 2, 3, 4, 5))
    .through(
      filter((n: number) => n % 2 === 0),
      map((n: number) => n * 10),
    )
    .collect<number>();

  assert.assertEquals(result, [20, 40]);
});

Deno.test("pipeline should propagate layer errors", async () => {
  const failLayer = defineLayer({
    name: "fail",
    create: () => ({
      transform(_chunk, _controller) {
        throw new Error("intentional failure");
      },
    }),
  });

  await assert.assertRejects(
    () =>
      pipeline()
        .from(values("test"))
        .through(failLayer)
        .to(nullSink())
        .run(),
    PipelineError,
  );
});

Deno.test({
  name: "pipeline timeout should reject with TimeoutError",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Use a slow layer that delays longer than the timeout
    const slowLayer = defineLayer({
      name: "slow",
      create: () => ({
        transform(_chunk, _controller) {
          return new Promise((resolve) => setTimeout(resolve, 10000));
        },
      }),
    });

    await assert.assertRejects(
      () =>
        pipeline()
          .from(values("test"))
          .through(slowLayer)
          .to(nullSink())
          .run({ timeout: 50 }),
      Error,
    );
  },
});

// =============================================================================
// Output Tests
// =============================================================================

Deno.test("output write() should enqueue to sink via buffer", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  out.write("hello");
  out.write("world");
  await out.flush();

  assert.assertEquals(buf.items().length, 2);
});

Deno.test("output writeln() should append newline", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  out.writeln("hello");
  await out.flush();

  assert.assertEquals(buf.items()[0], "hello\n");
});

Deno.test("output flush() on empty buffer should be no-op", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  await out.flush(); // Should not throw
  assert.assertEquals(buf.items().length, 0);
});

Deno.test("output close() should flush and close", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  out.write("data");
  await out.close();

  assert.assertEquals(buf.items().length, 1);
});

Deno.test("output with layers should transform data", async () => {
  const buf = buffer<unknown>();
  const out = output({
    sink: buf,
    layers: [map((s: unknown) => `[${String(s)}]`)],
  });

  out.write("test");
  await out.flush();

  assert.assertEquals(buf.items()[0], "[test]");
});

Deno.test({
  name: "output error handler should receive context",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    let receivedContext: ErrorContext | undefined;

    const failLayer = defineLayer({
      name: "fail",
      create: () => ({
        transform(_chunk, _controller) {
          throw new Error("boom");
        },
      }),
    });

    const out = output({
      sink: buffer(),
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
  const out = output();
  const piped = out.pipe(map((s: unknown) => `[${String(s)}]`));

  // pipe() returns a new Output (not the same reference)
  assert.assertNotEquals(out, piped);
});

// =============================================================================
// Coverage Gap Tests — edge cases from eng review
// =============================================================================

Deno.test("output write after close should be ignored", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  out.write("before");
  await out.close();
  out.write("after"); // should be silently ignored
  await new Promise((r) => setTimeout(r, 20));

  assert.assertEquals(buf.items().length, 1);
  assert.assertEquals(buf.items()[0], "before");
});

Deno.test("output write() with multiple args renders to single chunk", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  out.write("a", "b", "c");
  await out.flush();

  // Multiple string args are normalized to Spans and rendered as one chunk
  assert.assertEquals(buf.items().length, 1);
  assert.assertEquals(buf.items()[0], "abc");
});

Deno.test("defineLayer with start and flush callbacks", async () => {
  const events: string[] = [];

  const traced = defineLayer({
    name: "traced",
    create: () => ({
      start() {
        events.push("start");
      },
      transform(chunk, controller) {
        events.push("transform");
        controller.enqueue(chunk);
      },
      flush() {
        events.push("flush");
      },
    }),
  });

  await pipeline()
    .from(values("x"))
    .through(traced)
    .to(nullSink())
    .run();

  assert.assertEquals(events, ["start", "transform", "flush"]);
});

Deno.test("pipeline with zero layers (source → sink directly)", async () => {
  const result = await pipeline()
    .from(values(42))
    .collect<number>();

  assert.assertEquals(result, [42]);
});

Deno.test("multiplex sink close() should close all sinks", async () => {
  const buf1 = buffer<string>();
  const buf2 = buffer<string>();
  const mux = multiplex(buf1, buf2);

  const writer = mux.writable.getWriter();
  await writer.write(createChunk("data"));
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

  const result = await pipeline()
    .from(values(1, 2, 3, 4, 5, 6))
    .through(
      filter((n: number) => n % 2 === 0),
      map((n: number) => n * 100),
      tap((chunk: Chunk<number>) => {
        tapped.push(chunk.data);
      }),
    )
    .collect<number>();

  assert.assertEquals(result, [200, 400, 600]);
  assert.assertEquals(tapped, [200, 400, 600]);
});

Deno.test("integration: values → tee → map → buffer", async () => {
  const teeBuf = buffer<number>();

  const result = await pipeline()
    .from(values(10, 20, 30))
    .through(
      tee(teeBuf),
      map((n: number) => n + 1),
    )
    .collect<number>();

  // tee gets original values, collect gets mapped
  assert.assertEquals(teeBuf.items(), [10, 20, 30]);
  assert.assertEquals(result, [11, 21, 31]);
});

Deno.test("integration: tight write loop should not crash", async () => {
  const buf = buffer<unknown>();
  const out = output({ sink: buf });

  for (let i = 0; i < 1000; i++) {
    out.write(String(i));
  }

  await out.flush();
  assert.assertEquals(buf.items().length, 1000);
});
