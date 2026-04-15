// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import * as results from "@eserstack/primitives/results";
import {
  type AbortError,
  all,
  allPar,
  failTask,
  flatMap,
  flatMapW,
  fromPromise,
  map,
  type MergeContext,
  provideContext,
  runTask,
  succeed,
  type Task,
  task,
  validate,
  type ValidationError,
  withAbort,
  withLogging,
  withRetry,
  withTimeout,
} from "./task.ts";

// --- Constructors ---

describe("task", () => {
  describe("constructors", () => {
    it("task() creates a Task", async () => {
      const t = task(() => Promise.resolve(results.ok(42)));
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("succeed() creates a succeeding Task", async () => {
      const t = succeed("hello");
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, "hello");
    });

    it("failTask() creates a failing Task", async () => {
      const t = failTask("error");
      const result = await runTask(t);
      assert(results.isFail(result));
      assertEquals(result.error, "error");
    });

    it("fromPromise() wraps a promise-returning function", async () => {
      const t = fromPromise(() => Promise.resolve(42));
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("fromPromise() catches exceptions", async () => {
      const t = fromPromise<number, string>(
        () => Promise.reject(new Error("boom")),
        (e) => (e as Error).message,
      );
      const result = await runTask(t);
      assert(results.isFail(result));
      assertEquals(result.error, "boom");
    });
  });

  // --- Combinators ---

  describe("combinators", () => {
    it("map() transforms the success value", async () => {
      const t = map(succeed(21), (x) => x * 2);
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("map() propagates failure", async () => {
      const t = map(failTask("error"), (x: number) => x * 2);
      const result = await runTask(t);
      assert(results.isFail(result));
      assertEquals(result.error, "error");
    });

    it("flatMap() chains tasks", async () => {
      const t = flatMap(succeed(21), (x) => succeed(x * 2));
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("flatMap() short-circuits on failure", async () => {
      const t = flatMap(failTask("error"), (_x: number) => succeed(99));
      const result = await runTask(t);
      assert(results.isFail(result));
      assertEquals(result.error, "error");
    });

    it("flatMapW() widens the error type", async () => {
      type E1 = { readonly _tag: "E1" };
      type E2 = { readonly _tag: "E2" };

      const t1: Task<number, E1> = succeed(21) as Task<number, E1>;
      const t = flatMapW(
        t1,
        (x) => task<number, E2>(() => Promise.resolve(results.ok(x * 2))),
      );
      const result = await runTask(t);
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });
  });

  // --- Collection ---

  describe("collection", () => {
    it("all() runs tasks sequentially", async () => {
      const order: number[] = [];
      const tasks = [1, 2, 3].map((n) =>
        task(() => {
          order.push(n);
          return Promise.resolve(results.ok(n));
        })
      );
      const result = await runTask(all(tasks));
      assert(results.isOk(result));
      assertEquals(result.value, [1, 2, 3]);
      assertEquals(order, [1, 2, 3]);
    });

    it("all() fails fast", async () => {
      let ran = false;
      const tasks: Task<number, string>[] = [
        succeed(1) as Task<number, string>,
        failTask("error"),
        task<number, string>(() => {
          ran = true;
          return Promise.resolve(results.ok(3));
        }),
      ];
      const result = await runTask(all(tasks));
      assert(results.isFail(result));
      assertEquals(result.error, "error");
      assertEquals(ran, false);
    });

    it("allPar() runs tasks in parallel", async () => {
      const tasks = [1, 2, 3].map((n) => succeed(n));
      const result = await runTask(allPar(tasks));
      assert(results.isOk(result));
      assertEquals(result.value, [1, 2, 3]);
    });
  });

  // --- Context-Aware Tasks (Reader pattern) ---

  describe("context-aware tasks", () => {
    type DbContext = { readonly db: { get: (id: string) => string | null } };

    it("task() with context receives context on execution", async () => {
      const getUser = (id: string): Task<string, string, DbContext> =>
        task((ctx) => {
          const user = ctx.db.get(id);
          return Promise.resolve(
            user !== null ? results.ok(user) : results.fail("not found"),
          );
        });

      const mockDb = { get: (id: string) => id === "1" ? "Alice" : null };
      const result = await runTask(getUser("1"), { db: mockDb });
      assert(results.isOk(result));
      assertEquals(result.value, "Alice");
    });

    it("task() with context fails when resource missing", async () => {
      const getUser = (id: string): Task<string, string, DbContext> =>
        task((ctx) => {
          const user = ctx.db.get(id);
          return Promise.resolve(
            user !== null ? results.ok(user) : results.fail("not found"),
          );
        });

      const mockDb = { get: (_id: string) => null };
      const result = await runTask(getUser("99"), { db: mockDb });
      assert(results.isFail(result));
      assertEquals(result.error, "not found");
    });

    it("map() propagates context", async () => {
      const t: Task<number, never, DbContext> = task((_ctx) =>
        Promise.resolve(results.ok(21))
      );
      const doubled = map(t, (x) => x * 2);
      const result = await runTask(doubled, { db: { get: () => null } });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("all() propagates context", async () => {
      type CountCtx = { readonly multiplier: number };
      const tasks: Task<number, never, CountCtx>[] = [1, 2, 3].map((n) =>
        task((ctx) => Promise.resolve(results.ok(n * ctx.multiplier)))
      );
      const result = await runTask(all(tasks), { multiplier: 10 });
      assert(results.isOk(result));
      assertEquals(result.value, [10, 20, 30]);
    });

    it("allPar() propagates context", async () => {
      type CountCtx = { readonly multiplier: number };
      const tasks: Task<number, never, CountCtx>[] = [1, 2, 3].map((n) =>
        task((ctx) => Promise.resolve(results.ok(n * ctx.multiplier)))
      );
      const result = await runTask(allPar(tasks), { multiplier: 5 });
      assert(results.isOk(result));
      assertEquals(result.value, [5, 10, 15]);
    });
  });

  // --- Context Widening ---

  describe("context widening", () => {
    type AuthCtx = { readonly auth: { verify: (t: string) => boolean } };
    type DbCtx = { readonly db: { get: (id: string) => string | null } };

    it("flatMap widens context via MergeContext", async () => {
      const authenticate: Task<string, string, AuthCtx> = task((ctx) =>
        Promise.resolve(
          ctx.auth.verify("token")
            ? results.ok("user-1")
            : results.fail("unauthorized"),
        )
      );

      const loadName = (id: string): Task<string, string, DbCtx> =>
        task((ctx) => {
          const name = ctx.db.get(id);
          return Promise.resolve(
            name !== null ? results.ok(name) : results.fail("not found"),
          );
        });

      // Composed task requires AuthCtx & DbCtx
      const composed = flatMap(authenticate, loadName);

      const ctx: AuthCtx & DbCtx = {
        auth: { verify: () => true },
        db: { get: (id) => id === "user-1" ? "Alice" : null },
      };

      const result = await runTask(composed, ctx);
      assert(results.isOk(result));
      assertEquals(result.value, "Alice");
    });

    it("flatMapW widens both error and context", async () => {
      type AuthError = { readonly _tag: "AuthError" };
      type DbError = { readonly _tag: "DbError" };

      const authenticate: Task<string, AuthError, AuthCtx> = task((ctx) =>
        Promise.resolve(
          ctx.auth.verify("token")
            ? results.ok("user-1")
            : results.fail({ _tag: "AuthError" as const }),
        )
      );

      const loadName = (id: string): Task<string, DbError, DbCtx> =>
        task((ctx) => {
          const name = ctx.db.get(id);
          return Promise.resolve(
            name !== null
              ? results.ok(name)
              : results.fail({ _tag: "DbError" as const }),
          );
        });

      // Composed task: Task<string, AuthError | DbError, AuthCtx & DbCtx>
      const composed = flatMapW(authenticate, loadName);

      const ctx: AuthCtx & DbCtx = {
        auth: { verify: () => true },
        db: { get: (id) => id === "user-1" ? "Alice" : null },
      };

      const result = await runTask(composed, ctx);
      assert(results.isOk(result));
      assertEquals(result.value, "Alice");
    });

    it("flatMap with void + context merges correctly", async () => {
      const noCtx = succeed(21);
      const withCtx = (x: number): Task<number, never, DbCtx> =>
        task((_ctx) => Promise.resolve(results.ok(x * 2)));

      // MergeContext<void, DbCtx> = DbCtx
      const composed = flatMap(noCtx, withCtx);
      const result = await runTask(composed, {
        db: { get: () => null },
      });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });
  });

  // --- provideContext ---

  describe("provideContext", () => {
    it("satisfies context requirements", async () => {
      type AppCtx = { readonly greeting: string };
      const greet: Task<string, never, AppCtx> = task((ctx) =>
        Promise.resolve(results.ok(`Hello, ${ctx.greeting}!`))
      );

      const provided = provideContext(greet, { greeting: "World" });
      // Now runs without context
      const result = await runTask(provided);
      assert(results.isOk(result));
      assertEquals(result.value, "Hello, World!");
    });
  });

  // --- withAbort ---

  describe("withAbort", () => {
    it("returns AbortError when signal is already aborted", async () => {
      const t = succeed(42);
      const abortable = withAbort(t, 0);
      const controller = new AbortController();
      controller.abort();

      const result = await runTask(abortable, { signal: controller.signal });
      assert(results.isFail(result));
      assertEquals(
        (result.error as AbortError)._tag,
        "AbortError",
      );
    });

    it("succeeds when not aborted", async () => {
      const t = succeed(42);
      const abortable = withAbort(t, 0);
      const controller = new AbortController();

      const result = await runTask(abortable, { signal: controller.signal });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("times out after specified duration", async () => {
      let slowTimerId: ReturnType<typeof setTimeout> | undefined;
      const slow: Task<number, string> = task(() => {
        return new Promise<results.Result<number, string>>((resolve) => {
          slowTimerId = setTimeout(() => resolve(results.ok(42)), 500);
        });
      });

      const abortable = withAbort(slow, 10);
      const controller = new AbortController();

      const result = await runTask(abortable, { signal: controller.signal });
      // Clean up the slow task's timer that was abandoned by the race
      if (slowTimerId !== undefined) clearTimeout(slowTimerId);

      assert(results.isFail(result));
      assertEquals(
        (result.error as AbortError)._tag,
        "AbortError",
      );
    });

    it("merges context with Cancellable", async () => {
      type AppCtx = { readonly multiplier: number };
      const multiply: Task<number, never, AppCtx> = task((ctx) =>
        Promise.resolve(results.ok(21 * ctx.multiplier))
      );

      // withAbort adds Cancellable → MergeContext<AppCtx, Cancellable>
      const abortable = withAbort(multiply, 5000);
      const controller = new AbortController();

      const result = await runTask(abortable, {
        multiplier: 2,
        signal: controller.signal,
      });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });
  });

  // --- withLogging ---

  describe("withLogging", () => {
    it("logs start and completion on success", async () => {
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const t = succeed(42);
      const logged = withLogging(t, "test-op");

      const result = await runTask(logged, { logger });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
      assertEquals(logs, ["[test-op] started", "[test-op] completed"]);
    });

    it("logs start and failure on error", async () => {
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const t = failTask("boom");
      const logged = withLogging(t, "failing-op");

      const result = await runTask(logged, { logger });
      assert(results.isFail(result));
      assertEquals(result.error, "boom");
      assertEquals(logs, ["[failing-op] started", "[failing-op] failed"]);
    });

    it("merges context with Observable", async () => {
      type AppCtx = { readonly prefix: string };
      const logs: string[] = [];
      const logger = {
        info: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      };

      const greet: Task<string, never, AppCtx> = task((ctx) =>
        Promise.resolve(results.ok(`${ctx.prefix} World`))
      );

      const logged = withLogging(greet, "greet");

      const result = await runTask(logged, { prefix: "Hello", logger });
      assert(results.isOk(result));
      assertEquals(result.value, "Hello World");
      assertEquals(logs, ["[greet] started", "[greet] completed"]);
    });
  });

  // --- validate ---

  describe("validate", () => {
    it("succeeds when predicate passes", async () => {
      const validatePositive = validate(
        (n: number) => n > 0,
        "Must be positive",
      );
      const result = await runTask(validatePositive(42));
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });

    it("fails with ValidationError when predicate fails", async () => {
      const validatePositive = validate(
        (n: number) => n > 0,
        "Must be positive",
      );
      const result = await runTask(validatePositive(-1));
      assert(results.isFail(result));
      assertEquals((result.error as ValidationError)._tag, "ValidationError");
      assertEquals(
        (result.error as ValidationError).message,
        "Must be positive",
      );
    });

    it("composes with flatMapW", async () => {
      const validateEmail = validate(
        (s: string) => s.includes("@"),
        "Invalid email",
      );

      const processEmail = flatMapW(
        validateEmail("user@example.com"),
        (email) => succeed(`Processed: ${email}`),
      );

      const result = await runTask(processEmail);
      assert(results.isOk(result));
      assertEquals(result.value, "Processed: user@example.com");
    });
  });

  // --- withRetry / withTimeout with context ---

  describe("withRetry with context", () => {
    it("propagates context through retries", async () => {
      type AppCtx = { readonly value: number };
      let attempts = 0;

      const flaky: Task<number, string, AppCtx> = task((ctx) => {
        attempts++;
        if (attempts < 3) return Promise.resolve(results.fail("not yet"));
        return Promise.resolve(results.ok(ctx.value));
      });

      const retried = withRetry(flaky, 3);
      const result = await runTask(retried, { value: 42 });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
      assertEquals(attempts, 3);
    });
  });

  describe("withTimeout with context", () => {
    it("propagates context through timeout", async () => {
      type AppCtx = { readonly value: number };

      const fast: Task<number, string, AppCtx> = task((ctx) =>
        Promise.resolve(results.ok(ctx.value))
      );

      const timed = withTimeout(fast, 1000, "timeout");
      const result = await runTask(timed, { value: 42 });
      assert(results.isOk(result));
      assertEquals(result.value, 42);
    });
  });

  // --- MergeContext type tests (compile-time) ---

  describe("MergeContext type-level", () => {
    it("void + void = void (compile-time check)", () => {
      type R = MergeContext<void, void>;
      const _check: R = undefined as void;
      assertEquals(_check, undefined);
    });

    it("void + R = R (compile-time check)", () => {
      type R = MergeContext<void, { readonly x: number }>;
      const _check: R = { x: 1 };
      assertEquals(_check.x, 1);
    });

    it("R + void = R (compile-time check)", () => {
      type R = MergeContext<{ readonly x: number }, void>;
      const _check: R = { x: 2 };
      assertEquals(_check.x, 2);
    });

    it("R1 + R2 = R1 & R2 (compile-time check)", () => {
      type R = MergeContext<{ readonly x: number }, { readonly y: string }>;
      const _check: R = { x: 1, y: "hello" };
      assertEquals(_check.x, 1);
      assertEquals(_check.y, "hello");
    });
  });
});
