// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as fn from "./fn.ts";
import * as pipeline from "./pipeline.ts";
import * as results from "@eserstack/primitives/results";

// =============================================================================
// pipeline.collect() - Middleware/Streaming Pattern Tests
// =============================================================================

// === Basic Pipeline Tests ===

nodeTest.test("pipeline.collect() creates empty pipeline", async () => {
  const testPipeline = pipeline.collect<string, Error>();
  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, []);
  }
});

nodeTest.test("pipeline.collect() with single sync function", async () => {
  const testPipeline = pipeline.collect<string, Error>(() =>
    results.ok("hello"),
  );
  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["hello"]);
  }
});

nodeTest.test("pipeline.collect() with single async function", async () => {
  const testPipeline = pipeline.collect<string, Error>(async () => {
    await Promise.resolve();
    return results.ok("async hello");
  });
  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["async hello"]);
  }
});

nodeTest.test("pipeline.collect() with generator function", async () => {
  const testPipeline = pipeline.collect<string, Error>(function* () {
    yield results.ok("first");
    yield results.ok("second");
  });
  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

nodeTest.test("pipeline.collect() with async generator function", async () => {
  const testPipeline = pipeline.collect<string, Error>(async function* () {
    yield results.ok("first");
    await Promise.resolve();
    yield results.ok("second");
  });
  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

// === use() Tests ===

nodeTest.test("use() adds middleware to pipeline", async () => {
  const testPipeline = pipeline
    .collect<string, Error>()
    .use(() => results.ok("first"))
    .use(() => results.ok("second"));

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    // Only first middleware runs since next() isn't called
    assert.assertEquals(result.value, ["first"]);
  }
});

nodeTest.test("use() with next() chains middleware", async () => {
  const testPipeline = pipeline
    .collect<string, Error>()
    .use(async function* (ctx) {
      yield results.ok("first");
      yield* ctx.next();
    })
    .use(async function* () {
      yield results.ok("second");
    });

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

nodeTest.test("use() middleware receives arguments", async () => {
  const testPipeline = pipeline
    .collect<string, Error>()
    .use((_ctx, ...args) => results.ok(`args: ${args.join(",")}`));

  const result = await testPipeline.run("a", "b", "c");

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["args: a,b,c"]);
  }
});

// === iterate() Tests ===

nodeTest.test("iterate() yields results one by one", async () => {
  const testPipeline = pipeline.collect<number, Error>(function* () {
    yield results.ok(1);
    yield results.ok(2);
    yield results.ok(3);
  });

  const collected: number[] = [];
  for await (const item of testPipeline.iterate()) {
    if (results.isOk(item)) {
      collected.push(item.value);
    }
  }

  assert.assertEquals(collected, [1, 2, 3]);
});

// === testPipeline.run() Tests ===

nodeTest.test("testPipeline.run() collects all results", async () => {
  const testPipeline = pipeline.collect<number, Error>(function* () {
    yield results.ok(1);
    yield results.ok(2);
    yield results.ok(3);
  });

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, [1, 2, 3]);
  }
});

nodeTest.test("testPipeline.run() stops on first failure", async () => {
  const testPipeline = pipeline.collect<number, string>(function* () {
    yield results.ok(1);
    yield results.fail("error");
    yield results.ok(3); // This should not be reached
  });

  const result = await testPipeline.run();

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "error");
  }
});

// === runFirst() Tests ===

nodeTest.test("runFirst() returns first result", async () => {
  const testPipeline = pipeline.collect<number, Error>(function* () {
    yield results.ok(1);
    yield results.ok(2);
    yield results.ok(3);
  });

  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 1);
  }
});

nodeTest.test("runFirst() returns failure for empty pipeline", async () => {
  const testPipeline = pipeline.collect<number, Error>();
  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isFail(result), true);
});

nodeTest.test("runFirst() returns first failure", async () => {
  const testPipeline = pipeline.collect<number, string>(() =>
    results.fail("first-error"),
  );
  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
});

// === runLast() Tests ===

nodeTest.test("runLast() returns last result", async () => {
  const testPipeline = pipeline.collect<number, Error>(function* () {
    yield results.ok(1);
    yield results.ok(2);
    yield results.ok(3);
  });

  const result = await testPipeline.runLast();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 3);
  }
});

nodeTest.test("runLast() returns failure for empty pipeline", async () => {
  const testPipeline = pipeline.collect<number, Error>();
  const result = await testPipeline.runLast();

  assert.assertEquals(results.isFail(result), true);
});

nodeTest.test("runLast() stops on failure", async () => {
  const testPipeline = pipeline.collect<number, string>(function* () {
    yield results.ok(1);
    yield results.fail("error");
    yield results.ok(3);
  });

  const result = await testPipeline.runLast();

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "error");
  }
});

// === mapError() Tests ===

nodeTest.test("mapError() transforms error type", async () => {
  const testPipeline = pipeline
    .collect<number, string>(() => results.fail("string-error"))
    .mapError((e) => new Error(e));

  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
    assert.assertEquals(result.error.message, "string-error");
  }
});

nodeTest.test("mapError() does not affect success", async () => {
  const testPipeline = pipeline
    .collect<number, string>(() => results.ok(42))
    .mapError((e) => new Error(e));

  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === recover() Tests ===

nodeTest.test("recover() transforms failure to success", async () => {
  const testPipeline = pipeline
    .collect<number, string>(() => results.fail("error"))
    .recover((_e) => results.ok(0));

  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 0);
  }
});

nodeTest.test("recover() does not affect success", async () => {
  const testPipeline = pipeline
    .collect<number, string>(() => results.ok(42))
    .recover((_e) => results.ok(0));

  const result = await testPipeline.runFirst();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === Error Handling Tests ===

nodeTest.test("throws error when next() called multiple times", async () => {
  const testPipeline = pipeline.collect<string, Error>(async function* (ctx) {
    yield* ctx.next();
    yield* ctx.next(); // Second call should throw
  });

  await assert.assertRejects(
    () => testPipeline.run(),
    Error,
    "next() called multiple times",
  );
});

// === Context State Tests ===

nodeTest.test("context provides state object", async () => {
  let receivedState: Record<string, unknown> | null = null;

  const testPipeline = pipeline.collect<string, Error>((ctx) => {
    receivedState = ctx.state;
    return results.ok("done");
  });

  await testPipeline.run();

  assert.assertNotEquals(receivedState, null);
  assert.assertEquals(typeof receivedState, "object");
});

nodeTest.test(
  "context state is shared by the middleware of one run",
  async () => {
    const seen: unknown[] = [];

    const testPipeline = pipeline
      .collect<string, Error>()
      .use(async function* (ctx) {
        seen.push(ctx.state["user"]);
        ctx.state["user"] = "eser";
        yield* ctx.next();
      })
      .use((ctx) => results.ok(`user: ${ctx.state["user"]}`));

    const first = await testPipeline.run();
    const second = await testPipeline.run();

    assert.assertEquals(results.isOk(first) && first.value, ["user: eser"]);
    assert.assertEquals(results.isOk(second) && second.value, ["user: eser"]);
    // Each run starts with empty state, so nothing leaks from the first run.
    assert.assertEquals(seen, [undefined, undefined]);
  },
);

// === Context.next() Delegation Tests ===

nodeTest.test(
  "mapError() maps a failure that passes through next() once",
  async () => {
    const testPipeline = pipeline
      .collect<number, string>()
      .use(async function* (ctx) {
        yield* ctx.next();
      })
      .use(async function* (ctx) {
        yield* ctx.next();
      })
      .use(() => results.fail("inner"))
      .mapError((e) => `wrapped(${e})`);

    const result = await testPipeline.run();

    assert.assertEquals(
      results.isFail(result) && result.error,
      "wrapped(inner)",
    );
  },
);

nodeTest.test(
  "recover() recovers a failure that passes through next()",
  async () => {
    const testPipeline = pipeline
      .collect<number, string>()
      .use(async function* (ctx) {
        yield results.ok(1);
        yield* ctx.next();
      })
      .use(() => results.fail("inner"))
      .recover((_e) => results.ok(0));

    const result = await testPipeline.run();

    assert.assertEquals(results.isOk(result) && result.value, [1, 0]);
  },
);

nodeTest.test(
  "next() called twice throws when the next middleware delegates too",
  async () => {
    let downstreamRuns = 0;

    const testPipeline = pipeline
      .collect<number, Error>()
      .use(async function* (ctx) {
        yield* ctx.next();
        yield* ctx.next();
      })
      .use(async function* (ctx) {
        downstreamRuns++;
        yield* ctx.next();
      })
      .use(() => results.ok(0));

    await assert.assertRejects(
      () => testPipeline.run(),
      Error,
      "next() called multiple times",
    );
    assert.assertEquals(downstreamRuns, 1);
  },
);

// === Complex Pipeline Tests ===

nodeTest.test("complex pipeline with multiple middleware", async () => {
  const log: string[] = [];

  const testPipeline = pipeline
    .collect<string, Error>()
    .use(async function* (ctx) {
      log.push("middleware1:before");
      yield results.ok("m1-result");
      yield* ctx.next();
      log.push("middleware1:after");
    })
    .use(async function* (ctx) {
      log.push("middleware2:before");
      yield results.ok("m2-result");
      yield* ctx.next();
      log.push("middleware2:after");
    })
    .use(async function* () {
      log.push("handler");
      yield results.ok("handler-result");
    });

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
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

nodeTest.test("pipeline with mixed return types", async () => {
  const testPipeline = pipeline
    .collect<number, Error>()
    .use(async function* (ctx) {
      // Async generator
      yield results.ok(1);
      yield* ctx.next();
    })
    .use(async function* (ctx) {
      // Async generator (changed from sync for type compatibility)
      yield results.ok(2);
      yield* ctx.next();
    })
    .use((_ctx) => {
      // Sync function returning single result
      return results.ok(3);
    });

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, [1, 2, 3]);
  }
});

// === Initial Functions Tests ===

nodeTest.test("pipeline.collect() with initial functions", async () => {
  const testPipeline = pipeline.collect<string, Error>(
    async function* (ctx) {
      yield results.ok("first");
      yield* ctx.next();
    },
    async function* () {
      yield results.ok("second");
    },
  );

  const result = await testPipeline.run();

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, ["first", "second"]);
  }
});

// =============================================================================
// run() - Async Monadic Composition Tests
// =============================================================================

nodeTest.test("run() computes single value from sequence", async () => {
  const result = await fn.run<number, string>(async function* () {
    const a = yield* results.ok(5);
    const b = yield* results.ok(3);
    return a + b;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 8);
  }
});

nodeTest.test("run() short-circuits on first failure", async () => {
  let reachedSecond = false;

  const result = await fn.run<number, string>(async function* () {
    const _a = yield* results.fail<string>("first-error");
    reachedSecond = true;
    const _b = yield* results.ok(3);
    return 0;
  });

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
  assert.assertEquals(reachedSecond, false);
});

nodeTest.test("run() short-circuits on middle failure", async () => {
  let reachedThird = false;

  const result = await fn.run<number, string>(async function* () {
    const a = yield* results.ok(5);
    const _b = yield* results.fail<string>("middle-error");
    reachedThird = true;
    return a;
  });

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "middle-error");
  }
  assert.assertEquals(reachedThird, false);
});

nodeTest.test("run() allows using intermediate values", async () => {
  const double = (n: number): results.Result<number, string> =>
    results.ok(n * 2);
  const addTen = (n: number): results.Result<number, string> =>
    results.ok(n + 10);

  const result = await fn.run<number, string>(async function* () {
    const a = yield* results.ok(5);
    const b = yield* double(a); // Use 'a' here
    const c = yield* addTen(b); // Use 'b' here
    return c;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 + 10
  }
});

nodeTest.test("run() works with async operations", async () => {
  const fetchValue = async (
    n: number,
  ): Promise<results.Result<number, string>> => {
    await Promise.resolve();
    return results.ok(n * 2);
  };

  const result = await fn.run<number, string>(async function* () {
    const a = yield* await fetchValue(5);
    const b = yield* await fetchValue(a);
    return b;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 * 2
  }
});

nodeTest.test("run() handles complex object returns", async () => {
  type User = { id: number; name: string };
  type Post = { userId: number; title: string };

  const fetchUser = (id: number): results.Result<User, string> =>
    results.ok({ id, name: "John" });
  const fetchPosts = (userId: number): results.Result<Post[], string> =>
    results.ok([{ userId, title: "Hello" }]);

  const result = await fn.run<{ user: User; posts: Post[] }, string>(
    async function* () {
      const user = yield* fetchUser(1);
      const posts = yield* fetchPosts(user.id);
      return { user, posts };
    },
  );

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value.user.name, "John");
    assert.assertEquals(result.value.posts.length, 1);
    assert.assertEquals(result.value.posts[0]?.title, "Hello");
  }
});

// =============================================================================
// runSync() - Sync Monadic Composition Tests
// =============================================================================

nodeTest.test("runSync() computes single value from sequence", () => {
  const result = fn.runSync<number, string>(function* () {
    const a = yield* results.ok(5);
    const b = yield* results.ok(3);
    return a + b;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 8);
  }
});

nodeTest.test("runSync() short-circuits on first failure", () => {
  let reachedSecond = false;

  const result = fn.runSync<number, string>(function* () {
    const _a = yield* results.fail<string>("first-error");
    reachedSecond = true;
    const _b = yield* results.ok(3);
    return 0;
  });

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "first-error");
  }
  assert.assertEquals(reachedSecond, false);
});

nodeTest.test("runSync() short-circuits on middle failure", () => {
  let reachedThird = false;

  const result = fn.runSync<number, string>(function* () {
    const a = yield* results.ok(5);
    const _b = yield* results.fail<string>("middle-error");
    reachedThird = true;
    return a;
  });

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "middle-error");
  }
  assert.assertEquals(reachedThird, false);
});

nodeTest.test("runSync() allows using intermediate values", () => {
  const double = (n: number): results.Result<number, string> =>
    results.ok(n * 2);
  const addTen = (n: number): results.Result<number, string> =>
    results.ok(n + 10);

  const result = fn.runSync<number, string>(function* () {
    const a = yield* results.ok(5);
    const b = yield* double(a); // Use 'a' here
    const c = yield* addTen(b); // Use 'b' here
    return c;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 20); // 5 * 2 + 10
  }
});

nodeTest.test("runSync() handles complex object returns", () => {
  type Config = { port: number; host: string };

  const parsePort = (s: string): results.Result<number, string> => {
    const n = parseInt(s, 10);
    return isNaN(n) ? results.fail("Invalid port") : results.ok(n);
  };

  const validatePort = (n: number): results.Result<number, string> =>
    n > 0 && n < 65536 ? results.ok(n) : results.fail("Port out of range");

  const result = fn.runSync<Config, string>(function* () {
    const port = yield* parsePort("3000");
    const validPort = yield* validatePort(port);
    return { port: validPort, host: "localhost" };
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value.port, 3000);
    assert.assertEquals(result.value.host, "localhost");
  }
});

nodeTest.test("runSync() fails on invalid input", () => {
  const parsePort = (s: string): results.Result<number, string> => {
    const n = parseInt(s, 10);
    return isNaN(n) ? results.fail("Invalid port") : results.ok(n);
  };

  const result = fn.runSync<number, string>(function* () {
    const port = yield* parsePort("not-a-number");
    return port;
  });

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, "Invalid port");
  }
});

nodeTest.test("runSync() with single yield returns final value", () => {
  const result = fn.runSync<number, string>(function* () {
    const x = yield* results.ok(42);
    return x;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});

nodeTest.test("run() with single yield returns final value", async () => {
  const result = await fn.run<number, string>(async function* () {
    const x = yield* results.ok(42);
    return x;
  });

  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 42);
  }
});
