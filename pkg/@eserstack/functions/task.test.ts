// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as results from "@eserstack/primitives/results";
import * as task from "./task.ts";
import type {
  AbortError,
  MergeContext,
  Task,
  ValidationError,
} from "./task.ts";

// --- Constructors ---

bdd.describe("task", () => {
  bdd.describe("constructors", () => {
    bdd.it("task() creates a Task", async () => {
      const t = task.task(() => Promise.resolve(results.ok(42)));
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("succeed() creates a succeeding Task", async () => {
      const t = task.succeed("hello");
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "hello");
    });

    bdd.it("failTask() creates a failing Task", async () => {
      const t = task.failTask("error");
      const result = await task.runTask(t);
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "error");
    });

    bdd.it("fromPromise() wraps a promise-returning function", async () => {
      const t = task.fromPromise(() => Promise.resolve(42));
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("fromPromise() catches exceptions", async () => {
      const t = task.fromPromise<number, string>(
        () => Promise.reject(new Error("boom")),
        (e) => (e as Error).message,
      );
      const result = await task.runTask(t);
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "boom");
    });
  });

  // --- Combinators ---

  bdd.describe("combinators", () => {
    bdd.it("map() transforms the success value", async () => {
      const t = task.map(task.succeed(21), (x) => x * 2);
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("map() propagates failure", async () => {
      const t = task.map(task.failTask("error"), (x: number) => x * 2);
      const result = await task.runTask(t);
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "error");
    });

    bdd.it("flatMap() chains tasks", async () => {
      const t = task.flatMap(task.succeed(21), (x) => task.succeed(x * 2));
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("flatMap() short-circuits on failure", async () => {
      const t = task.flatMap(task.failTask("error"), (_x: number) =>
        task.succeed(99),
      );
      const result = await task.runTask(t);
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "error");
    });

    bdd.it("flatMapW() widens the error type", async () => {
      type E1 = { readonly _tag: "E1" };
      type E2 = { readonly _tag: "E2" };

      const t1: Task<number, E1> = task.succeed(21) as Task<number, E1>;
      const t = task.flatMapW(t1, (x) =>
        task.task<number, E2>(() => Promise.resolve(results.ok(x * 2))),
      );
      const result = await task.runTask(t);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });
  });

  // --- Collection ---

  bdd.describe("collection", () => {
    bdd.it("all() runs tasks sequentially", async () => {
      const order: number[] = [];
      const tasks = [1, 2, 3].map((n) =>
        task.task(() => {
          order.push(n);
          return Promise.resolve(results.ok(n));
        }),
      );
      const result = await task.runTask(task.all(tasks));
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, [1, 2, 3]);
      assert.assertEquals(order, [1, 2, 3]);
    });

    bdd.it("all() fails fast", async () => {
      let ran = false;
      const tasks: Task<number, string>[] = [
        task.succeed(1) as Task<number, string>,
        task.failTask("error"),
        task.task<number, string>(() => {
          ran = true;
          return Promise.resolve(results.ok(3));
        }),
      ];
      const result = await task.runTask(task.all(tasks));
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "error");
      assert.assertEquals(ran, false);
    });

    bdd.it("allPar() runs tasks in parallel", async () => {
      const tasks = [1, 2, 3].map((n) => task.succeed(n));
      const result = await task.runTask(task.allPar(tasks));
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, [1, 2, 3]);
    });
  });

  // --- Context-Aware Tasks (Reader pattern) ---

  bdd.describe("context-aware tasks", () => {
    type DbContext = { readonly db: { get: (id: string) => string | null } };

    bdd.it("task() with context receives context on execution", async () => {
      const getUser = (id: string): Task<string, string, DbContext> =>
        task.task((ctx) => {
          const user = ctx.db.get(id);
          return Promise.resolve(
            user !== null ? results.ok(user) : results.fail("not found"),
          );
        });

      const mockDb = { get: (id: string) => (id === "1" ? "Alice" : null) };
      const result = await task.runTask(getUser("1"), { db: mockDb });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Alice");
    });

    bdd.it("task() with context fails when resource missing", async () => {
      const getUser = (id: string): Task<string, string, DbContext> =>
        task.task((ctx) => {
          const user = ctx.db.get(id);
          return Promise.resolve(
            user !== null ? results.ok(user) : results.fail("not found"),
          );
        });

      const mockDb = { get: (_id: string) => null };
      const result = await task.runTask(getUser("99"), { db: mockDb });
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "not found");
    });

    bdd.it("map() propagates context", async () => {
      const t: Task<number, never, DbContext> = task.task((_ctx) =>
        Promise.resolve(results.ok(21)),
      );
      const doubled = task.map(t, (x) => x * 2);
      const result = await task.runTask(doubled, { db: { get: () => null } });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("all() propagates context", async () => {
      type CountCtx = { readonly multiplier: number };
      const tasks: Task<number, never, CountCtx>[] = [1, 2, 3].map((n) =>
        task.task((ctx) => Promise.resolve(results.ok(n * ctx.multiplier))),
      );
      const result = await task.runTask(task.all(tasks), { multiplier: 10 });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, [10, 20, 30]);
    });

    bdd.it("allPar() propagates context", async () => {
      type CountCtx = { readonly multiplier: number };
      const tasks: Task<number, never, CountCtx>[] = [1, 2, 3].map((n) =>
        task.task((ctx) => Promise.resolve(results.ok(n * ctx.multiplier))),
      );
      const result = await task.runTask(task.allPar(tasks), { multiplier: 5 });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, [5, 10, 15]);
    });
  });

  // --- Context Widening ---

  bdd.describe("context widening", () => {
    type AuthCtx = { readonly auth: { verify: (t: string) => boolean } };
    type DbCtx = { readonly db: { get: (id: string) => string | null } };

    bdd.it("flatMap widens context via MergeContext", async () => {
      const authenticate: Task<string, string, AuthCtx> = task.task((ctx) =>
        Promise.resolve(
          ctx.auth.verify("token")
            ? results.ok("user-1")
            : results.fail("unauthorized"),
        ),
      );

      const loadName = (id: string): Task<string, string, DbCtx> =>
        task.task((ctx) => {
          const name = ctx.db.get(id);
          return Promise.resolve(
            name !== null ? results.ok(name) : results.fail("not found"),
          );
        });

      // Composed task requires AuthCtx & DbCtx
      const composed = task.flatMap(authenticate, loadName);

      const ctx: AuthCtx & DbCtx = {
        auth: { verify: () => true },
        db: { get: (id) => (id === "user-1" ? "Alice" : null) },
      };

      const result = await task.runTask(composed, ctx);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Alice");
    });

    bdd.it("flatMapW widens both error and context", async () => {
      type AuthError = { readonly _tag: "AuthError" };
      type DbError = { readonly _tag: "DbError" };

      const authenticate: Task<string, AuthError, AuthCtx> = task.task((ctx) =>
        Promise.resolve(
          ctx.auth.verify("token")
            ? results.ok("user-1")
            : results.fail({ _tag: "AuthError" as const }),
        ),
      );

      const loadName = (id: string): Task<string, DbError, DbCtx> =>
        task.task((ctx) => {
          const name = ctx.db.get(id);
          return Promise.resolve(
            name !== null
              ? results.ok(name)
              : results.fail({ _tag: "DbError" as const }),
          );
        });

      // Composed task: Task<string, AuthError | DbError, AuthCtx & DbCtx>
      const composed = task.flatMapW(authenticate, loadName);

      const ctx: AuthCtx & DbCtx = {
        auth: { verify: () => true },
        db: { get: (id) => (id === "user-1" ? "Alice" : null) },
      };

      const result = await task.runTask(composed, ctx);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Alice");
    });

    bdd.it("flatMap with void + context merges correctly", async () => {
      const noCtx = task.succeed(21);
      const withCtx = (x: number): Task<number, never, DbCtx> =>
        task.task((_ctx) => Promise.resolve(results.ok(x * 2)));

      // MergeContext<void, DbCtx> = DbCtx
      const composed = task.flatMap(noCtx, withCtx);
      const result = await task.runTask(composed, {
        db: { get: () => null },
      });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });
  });

  // --- provideContext ---

  bdd.describe("provideContext", () => {
    bdd.it("satisfies context requirements", async () => {
      type AppCtx = { readonly greeting: string };
      const greet: Task<string, never, AppCtx> = task.task((ctx) =>
        Promise.resolve(results.ok(`Hello, ${ctx.greeting}!`)),
      );

      const provided = task.provideContext(greet, { greeting: "World" });
      // Now runs without context
      const result = await task.runTask(provided);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Hello, World!");
    });
  });

  // --- withAbort ---

  bdd.describe("withAbort", () => {
    bdd.it("returns AbortError when signal is already aborted", async () => {
      const t = task.succeed(42);
      const abortable = task.withAbort(t, 0);
      const controller = new AbortController();
      controller.abort();

      const result = await task.runTask(abortable, {
        signal: controller.signal,
      });
      assert.assert(results.isFail(result));
      assert.assertEquals((result.error as AbortError)._tag, "AbortError");
    });

    bdd.it("succeeds when not aborted", async () => {
      const t = task.succeed(42);
      const abortable = task.withAbort(t, 0);
      const controller = new AbortController();

      const result = await task.runTask(abortable, {
        signal: controller.signal,
      });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("times out after specified duration", async () => {
      let slowTimerId: ReturnType<typeof setTimeout> | undefined;
      const slow: Task<number, string> = task.task(() => {
        return new Promise<results.Result<number, string>>((resolve) => {
          slowTimerId = setTimeout(() => resolve(results.ok(42)), 500);
        });
      });

      const abortable = task.withAbort(slow, 10);
      const controller = new AbortController();

      const result = await task.runTask(abortable, {
        signal: controller.signal,
      });
      // Clean up the slow task's timer that was abandoned by the race
      if (slowTimerId !== undefined) clearTimeout(slowTimerId);

      assert.assert(results.isFail(result));
      assert.assertEquals((result.error as AbortError)._tag, "AbortError");
    });

    bdd.it("merges context with Cancellable", async () => {
      type AppCtx = { readonly multiplier: number };
      const multiply: Task<number, never, AppCtx> = task.task((ctx) =>
        Promise.resolve(results.ok(21 * ctx.multiplier)),
      );

      // withAbort adds Cancellable → MergeContext<AppCtx, Cancellable>
      const abortable = task.withAbort(multiply, 5000);
      const controller = new AbortController();

      const result = await task.runTask(abortable, {
        multiplier: 2,
        signal: controller.signal,
      });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });
  });

  // --- withLogging ---

  bdd.describe("withLogging", () => {
    bdd.it("logs start and completion on success", async () => {
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const t = task.succeed(42);
      const logged = task.withLogging(t, "test-op");

      const result = await task.runTask(logged, { logger });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
      assert.assertEquals(logs, ["[test-op] started", "[test-op] completed"]);
    });

    bdd.it("logs start and failure on error", async () => {
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const t = task.failTask("boom");
      const logged = task.withLogging(t, "failing-op");

      const result = await task.runTask(logged, { logger });
      assert.assert(results.isFail(result));
      assert.assertEquals(result.error, "boom");
      assert.assertEquals(logs, [
        "[failing-op] started",
        "[failing-op] failed",
      ]);
    });

    bdd.it("merges context with Observable", async () => {
      type AppCtx = { readonly prefix: string };
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const greet: Task<string, never, AppCtx> = task.task((ctx) =>
        Promise.resolve(results.ok(`${ctx.prefix} World`)),
      );

      const logged = task.withLogging(greet, "greet");

      const result = await task.runTask(logged, { prefix: "Hello", logger });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Hello World");
      assert.assertEquals(logs, ["[greet] started", "[greet] completed"]);
    });
  });

  // --- validate ---

  bdd.describe("validate", () => {
    bdd.it("succeeds when predicate passes", async () => {
      const validatePositive = task.validate(
        (n: number) => n > 0,
        "Must be positive",
      );
      const result = await task.runTask(validatePositive(42));
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });

    bdd.it("fails with ValidationError when predicate fails", async () => {
      const validatePositive = task.validate(
        (n: number) => n > 0,
        "Must be positive",
      );
      const result = await task.runTask(validatePositive(-1));
      assert.assert(results.isFail(result));
      assert.assertEquals(
        (result.error as ValidationError)._tag,
        "ValidationError",
      );
      assert.assertEquals(
        (result.error as ValidationError).message,
        "Must be positive",
      );
    });

    bdd.it("composes with flatMapW", async () => {
      const validateEmail = task.validate(
        (s: string) => s.includes("@"),
        "Invalid email",
      );

      const processEmail = task.flatMapW(
        validateEmail("user@example.com"),
        (email) => task.succeed(`Processed: ${email}`),
      );

      const result = await task.runTask(processEmail);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Processed: user@example.com");
    });
  });

  // --- withRetry / withTimeout with context ---

  bdd.describe("withRetry with context", () => {
    bdd.it("propagates context through retries", async () => {
      type AppCtx = { readonly value: number };
      let attempts = 0;

      const flaky: Task<number, string, AppCtx> = task.task((ctx) => {
        attempts++;
        if (attempts < 3) return Promise.resolve(results.fail("not yet"));
        return Promise.resolve(results.ok(ctx.value));
      });

      const retried = task.withRetry(flaky, 3);
      const result = await task.runTask(retried, { value: 42 });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
      assert.assertEquals(attempts, 3);
    });
  });

  bdd.describe("withTimeout with context", () => {
    bdd.it("propagates context through timeout", async () => {
      type AppCtx = { readonly value: number };

      const fast: Task<number, string, AppCtx> = task.task((ctx) =>
        Promise.resolve(results.ok(ctx.value)),
      );

      const timed = task.withTimeout(fast, 1000, "timeout");
      const result = await task.runTask(timed, { value: 42 });
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, 42);
    });
  });

  // --- MergeContext type tests (compile-time) ---

  bdd.describe("MergeContext type-level", () => {
    bdd.it("void + void = void (compile-time check)", () => {
      type R = MergeContext<void, void>;
      const _check: R = undefined as void;
      assert.assertEquals(_check, undefined);
    });

    bdd.it("void + R = R (compile-time check)", () => {
      type R = MergeContext<void, { readonly x: number }>;
      const _check: R = { x: 1 };
      assert.assertEquals(_check.x, 1);
    });

    bdd.it("R + void = R (compile-time check)", () => {
      type R = MergeContext<{ readonly x: number }, void>;
      const _check: R = { x: 2 };
      assert.assertEquals(_check.x, 2);
    });

    bdd.it("R1 + R2 = R1 & R2 (compile-time check)", () => {
      type R = MergeContext<{ readonly x: number }, { readonly y: string }>;
      const _check: R = { x: 1, y: "hello" };
      assert.assertEquals(_check.x, 1);
      assert.assertEquals(_check.y, "hello");
    });
  });
});
