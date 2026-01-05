// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { collect, run, runSync } from "./fn.ts";
import { fail, isFail, isOk, ok, type Result } from "./results.ts";

// =============================================================================
// collect() - Middleware/Streaming Pattern Tests
// =============================================================================

// === Basic Pipeline Tests ===

Deno.test("collect() creates empty pipeline", async () => {
  const pipeline = collect<string, Error>();
  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, []);
  }
});

Deno.test("collect() with single sync function", async () => {
  const pipeline = collect<string, Error>(() => ok("hello"));
  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["hello"]);
  }
});

Deno.test("collect() with single async function", async () => {
  const pipeline = collect<string, Error>(async () => {
    await Promise.resolve();
    return ok("async hello");
  });
  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["async hello"]);
  }
});

Deno.test("collect() with generator function", async () => {
  const pipeline = collect<string, Error>(function* () {
    yield ok("first");
    yield ok("second");
  });
  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

Deno.test("collect() with async generator function", async () => {
  const pipeline = collect<string, Error>(async function* () {
    yield ok("first");
    await Promise.resolve();
    yield ok("second");
  });
  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

// === use() Tests ===

Deno.test("use() adds middleware to pipeline", async () => {
  const pipeline = collect<string, Error>()
    .use(() => ok("first"))
    .use(() => ok("second"));

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    // Only first middleware runs since next() isn't called
    assert.assertEquals(result.value, ["first"]);
  }
});

Deno.test("use() with next() chains middleware", async () => {
  const pipeline = collect<string, Error>()
    .use(async function* (ctx) {
      yield ok("first");
      yield* ctx.next() as AsyncGenerator<Result<string, Error>>;
    })
    .use(async function* () {
      yield ok("second");
    });

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

Deno.test("use() middleware receives arguments", async () => {
  const pipeline = collect<string, Error>()
    .use((_ctx, ...args) => ok(`args: ${args.join(",")}`));

  const result = await pipeline.run("a", "b", "c");

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["args: a,b,c"]);
  }
});

// === iterate() Tests ===

Deno.test("iterate() yields results one by one", async () => {
  const pipeline = collect<number, Error>(function* () {
    yield ok(1);
    yield ok(2);
    yield ok(3);
  });

  const results: number[] = [];
  for await (const item of pipeline.iterate()) {
    if (isOk(item)) {
      results.push(item.value);
    }
  }

  assert.assertEquals(results, [1, 2, 3]);
});

// === pipeline.run() Tests ===

Deno.test("pipeline.run() collects all results", async () => {
  const pipeline = collect<number, Error>(function* () {
    yield ok(1);
    yield ok(2);
    yield ok(3);
  });

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, [1, 2, 3]);
  }
});

Deno.test("pipeline.run() stops on first failure", async () => {
  const pipeline = collect<number, string>(function* () {
    yield ok(1);
    yield fail("error");
    yield ok(3); // This should not be reached
  });

  const result = await pipeline.run();

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "error");
  }
});

// === runFirst() Tests ===

Deno.test("runFirst() returns first result", async () => {
  const pipeline = collect<number, Error>(function* () {
    yield ok(1);
    yield ok(2);
    yield ok(3);
  });

  const result = await pipeline.runFirst();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 1);
  }
});

Deno.test("runFirst() returns failure for empty pipeline", async () => {
  const pipeline = collect<number, Error>();
  const result = await pipeline.runFirst();

  assert.assertEquals(isFail(result), true);
});

Deno.test("runFirst() returns first failure", async () => {
  const pipeline = collect<number, string>(() => fail("first-error"));
  const result = await pipeline.runFirst();

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
});

// === runLast() Tests ===

Deno.test("runLast() returns last result", async () => {
  const pipeline = collect<number, Error>(function* () {
    yield ok(1);
    yield ok(2);
    yield ok(3);
  });

  const result = await pipeline.runLast();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 3);
  }
});

Deno.test("runLast() returns failure for empty pipeline", async () => {
  const pipeline = collect<number, Error>();
  const result = await pipeline.runLast();

  assert.assertEquals(isFail(result), true);
});

Deno.test("runLast() stops on failure", async () => {
  const pipeline = collect<number, string>(function* () {
    yield ok(1);
    yield fail("error");
    yield ok(3);
  });

  const result = await pipeline.runLast();

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "error");
  }
});

// === mapError() Tests ===

Deno.test("mapError() transforms error type", async () => {
  const pipeline = collect<number, string>(() => fail("string-error"))
    .mapError((e) => new Error(e));

  const result = await pipeline.runFirst();

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
    assert.assertEquals(result.error.message, "string-error");
  }
});

Deno.test("mapError() does not affect success", async () => {
  const pipeline = collect<number, string>(() => ok(42))
    .mapError((e) => new Error(e));

  const result = await pipeline.runFirst();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === recover() Tests ===

Deno.test("recover() transforms failure to success", async () => {
  const pipeline = collect<number, string>(() => fail("error"))
    .recover((_e) => ok(0));

  const result = await pipeline.runFirst();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 0);
  }
});

Deno.test("recover() does not affect success", async () => {
  const pipeline = collect<number, string>(() => ok(42))
    .recover((_e) => ok(0));

  const result = await pipeline.runFirst();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === Error Handling Tests ===

Deno.test("throws error when next() called multiple times", async () => {
  const pipeline = collect<string, Error>(async function* (ctx) {
    yield* ctx.next() as AsyncGenerator<Result<string, Error>>;
    yield* ctx.next() as AsyncGenerator<Result<string, Error>>; // Second call should throw
  });

  await assert.assertRejects(
    () => pipeline.run(),
    Error,
    "next() called multiple times",
  );
});

// === Context State Tests ===

Deno.test("context provides state object", async () => {
  let receivedState: Record<string, unknown> | null = null;

  const pipeline = collect<string, Error>((ctx) => {
    receivedState = ctx.state;
    return ok("done");
  });

  await pipeline.run();

  assert.assertNotEquals(receivedState, null);
  assert.assertEquals(typeof receivedState, "object");
});

// === Complex Pipeline Tests ===

Deno.test("complex pipeline with multiple middleware", async () => {
  const log: string[] = [];

  const pipeline = collect<string, Error>()
    .use(async function* (ctx) {
      log.push("middleware1:before");
      yield ok("m1-result");
      yield* ctx.next() as AsyncGenerator<Result<string, Error>>;
      log.push("middleware1:after");
    })
    .use(async function* (ctx) {
      log.push("middleware2:before");
      yield ok("m2-result");
      yield* ctx.next() as AsyncGenerator<Result<string, Error>>;
      log.push("middleware2:after");
    })
    .use(async function* () {
      log.push("handler");
      yield ok("handler-result");
    });

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, [
      "m1-result",
      "m2-result",
      "handler-result",
    ]);
  }
  assert.assertEquals(log, [
    "middleware1:before",
    "middleware2:before",
    "handler",
    "middleware2:after",
    "middleware1:after",
  ]);
});

Deno.test("pipeline with mixed return types", async () => {
  const pipeline = collect<number, Error>()
    .use(async function* (ctx) {
      // Async generator
      yield ok(1);
      yield* ctx.next() as AsyncGenerator<Result<number, Error>>;
    })
    .use(async function* (ctx) {
      // Async generator (changed from sync for type compatibility)
      yield ok(2);
      yield* ctx.next() as AsyncGenerator<Result<number, Error>>;
    })
    .use((_ctx) => {
      // Sync function returning single result
      return ok(3);
    });

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, [1, 2, 3]);
  }
});

// === Initial Functions Tests ===

Deno.test("collect() with initial functions", async () => {
  const pipeline = collect<string, Error>(
    async function* (ctx) {
      yield ok("first");
      yield* ctx.next() as AsyncGenerator<Result<string, Error>>;
    },
    async function* () {
      yield ok("second");
    },
  );

  const result = await pipeline.run();

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

// =============================================================================
// run() - Async Monadic Composition Tests
// =============================================================================

Deno.test("run() computes single value from sequence", async () => {
  const result = await run<number, string>(async function* () {
    const a = yield* ok(5);
    const b = yield* ok(3);
    return a + b;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 8);
  }
});

Deno.test("run() short-circuits on first failure", async () => {
  let reachedSecond = false;

  const result = await run<number, string>(async function* () {
    const _a = yield* fail<string>("first-error");
    reachedSecond = true;
    const _b = yield* ok(3);
    return 0;
  });

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
  assert.assertEquals(reachedSecond, false);
});

Deno.test("run() short-circuits on middle failure", async () => {
  let reachedThird = false;

  const result = await run<number, string>(async function* () {
    const a = yield* ok(5);
    const _b = yield* fail<string>("middle-error");
    reachedThird = true;
    return a;
  });

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "middle-error");
  }
  assert.assertEquals(reachedThird, false);
});

Deno.test("run() allows using intermediate values", async () => {
  const double = (n: number): Result<number, string> => ok(n * 2);
  const addTen = (n: number): Result<number, string> => ok(n + 10);

  const result = await run<number, string>(async function* () {
    const a = yield* ok(5);
    const b = yield* double(a); // Use 'a' here
    const c = yield* addTen(b); // Use 'b' here
    return c;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 + 10
  }
});

Deno.test("run() works with async operations", async () => {
  const fetchValue = async (n: number): Promise<Result<number, string>> => {
    await Promise.resolve();
    return ok(n * 2);
  };

  const result = await run<number, string>(async function* () {
    const a = yield* await fetchValue(5);
    const b = yield* await fetchValue(a);
    return b;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 * 2
  }
});

Deno.test("run() handles complex object returns", async () => {
  type User = { id: number; name: string };
  type Post = { userId: number; title: string };

  const fetchUser = (id: number): Result<User, string> =>
    ok({ id, name: "John" });
  const fetchPosts = (userId: number): Result<Post[], string> =>
    ok([{ userId, title: "Hello" }]);

  const result = await run<{ user: User; posts: Post[] }, string>(
    async function* () {
      const user = yield* fetchUser(1);
      const posts = yield* fetchPosts(user.id);
      return { user, posts };
    },
  );

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value.user.name, "John");
    assert.assertEquals(result.value.posts.length, 1);
    assert.assertEquals(result.value.posts[0]?.title, "Hello");
  }
});

// =============================================================================
// runSync() - Sync Monadic Composition Tests
// =============================================================================

Deno.test("runSync() computes single value from sequence", () => {
  const result = runSync<number, string>(function* () {
    const a = yield* ok(5);
    const b = yield* ok(3);
    return a + b;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 8);
  }
});

Deno.test("runSync() short-circuits on first failure", () => {
  let reachedSecond = false;

  const result = runSync<number, string>(function* () {
    const _a = yield* fail<string>("first-error");
    reachedSecond = true;
    const _b = yield* ok(3);
    return 0;
  });

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
  assert.assertEquals(reachedSecond, false);
});

Deno.test("runSync() short-circuits on middle failure", () => {
  let reachedThird = false;

  const result = runSync<number, string>(function* () {
    const a = yield* ok(5);
    const _b = yield* fail<string>("middle-error");
    reachedThird = true;
    return a;
  });

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "middle-error");
  }
  assert.assertEquals(reachedThird, false);
});

Deno.test("runSync() allows using intermediate values", () => {
  const double = (n: number): Result<number, string> => ok(n * 2);
  const addTen = (n: number): Result<number, string> => ok(n + 10);

  const result = runSync<number, string>(function* () {
    const a = yield* ok(5);
    const b = yield* double(a); // Use 'a' here
    const c = yield* addTen(b); // Use 'b' here
    return c;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 + 10
  }
});

Deno.test("runSync() handles complex object returns", () => {
  type Config = { port: number; host: string };

  const parsePort = (s: string): Result<number, string> => {
    const n = parseInt(s, 10);
    return isNaN(n) ? fail("Invalid port") : ok(n);
  };

  const validatePort = (n: number): Result<number, string> =>
    n > 0 && n < 65536 ? ok(n) : fail("Port out of range");

  const result = runSync<Config, string>(function* () {
    const port = yield* parsePort("3000");
    const validPort = yield* validatePort(port);
    return { port: validPort, host: "localhost" };
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value.port, 3000);
    assert.assertEquals(result.value.host, "localhost");
  }
});

Deno.test("runSync() fails on invalid input", () => {
  const parsePort = (s: string): Result<number, string> => {
    const n = parseInt(s, 10);
    return isNaN(n) ? fail("Invalid port") : ok(n);
  };

  const result = runSync<number, string>(function* () {
    const port = yield* parsePort("not-a-number");
    return port;
  });

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "Invalid port");
  }
});

Deno.test("runSync() with single yield returns final value", () => {
  const result = runSync<number, string>(function* () {
    const x = yield* ok(42);
    return x;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

Deno.test("run() with single yield returns final value", async () => {
  const result = await run<number, string>(async function* () {
    const x = yield* ok(42);
    return x;
  });

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});
