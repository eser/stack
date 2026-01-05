// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  acquireRelease,
  bracket,
  bracketWithReleaseError,
  createScope,
  ensure,
  retry,
  retryWithBackoff,
  scoped,
  using,
  withTimeout,
} from "./resources.ts";
import { fail, isFail, isOk, ok } from "./results.ts";

// === bracket() Tests ===

Deno.test("bracket() acquires, uses, and releases resource successfully", async () => {
  const log: string[] = [];

  const result = await bracket(
    () => {
      log.push("acquire");
      return ok("resource");
    },
    (resource) => {
      log.push(`use:${resource}`);
      return ok("result");
    },
    (resource) => {
      log.push(`release:${resource}`);
    },
  );

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, "result");
  }
  assert.assertEquals(log, ["acquire", "use:resource", "release:resource"]);
});

Deno.test("bracket() releases resource even when use fails", async () => {
  const log: string[] = [];

  const result = await bracket(
    () => {
      log.push("acquire");
      return ok("resource");
    },
    (_resource) => {
      log.push("use");
      return fail<string>("use-error");
    },
    (resource) => {
      log.push(`release:${resource}`);
    },
  );

  assert.assertEquals(isFail(result), true);
  assert.assertEquals(log, ["acquire", "use", "release:resource"]);
});

Deno.test("bracket() returns acquire failure without calling use or release", async () => {
  const log: string[] = [];

  const result = await bracket(
    () => {
      log.push("acquire");
      return fail<string>("acquire-error");
    },
    (_resource: string) => {
      log.push("use");
      return ok("result");
    },
    (_resource: string) => {
      log.push("release");
    },
  );

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "acquire-error");
  }
  assert.assertEquals(log, ["acquire"]);
});

Deno.test("bracket() works with async acquire", async () => {
  const result = await bracket(
    async () => {
      await Promise.resolve();
      return ok("async-resource");
    },
    (resource) => ok(`got:${resource}`),
    () => {},
  );

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, "got:async-resource");
  }
});

Deno.test("bracket() works with async release", async () => {
  let released = false;

  await bracket(
    () => ok("resource"),
    () => ok("result"),
    async () => {
      await Promise.resolve();
      released = true;
    },
  );

  assert.assertEquals(released, true);
});

// === using() Tests ===

Deno.test("using() works like bracket with sync release", async () => {
  const log: string[] = [];

  const result = await using(
    () => ok("resource"),
    (resource) => {
      log.push(`use:${resource}`);
      return ok("result");
    },
    (resource) => {
      log.push(`release:${resource}`);
    },
  );

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(log, ["use:resource", "release:resource"]);
});

// === bracketWithReleaseError() Tests ===

Deno.test("bracketWithReleaseError() propagates release error", async () => {
  const result = await bracketWithReleaseError(
    () => ok("resource"),
    () => ok("result"),
    () => fail<string>("release-error"),
  );

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "release-error");
  }
});

Deno.test("bracketWithReleaseError() returns use result on successful release", async () => {
  const result = await bracketWithReleaseError(
    () => ok("resource"),
    () => ok("result"),
    () => ok(undefined),
  );

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, "result");
  }
});

// === createScope() Tests ===

Deno.test("createScope() executes finalizers in reverse order", async () => {
  const log: string[] = [];
  const scope = createScope();

  scope.addFinalizer(() => {
    log.push("first");
  });
  scope.addFinalizer(() => {
    log.push("second");
  });
  scope.addFinalizer(() => {
    log.push("third");
  });

  await scope.close();

  assert.assertEquals(log, ["third", "second", "first"]);
});

Deno.test("createScope() use() closes scope after function completes", async () => {
  const log: string[] = [];
  const scope = createScope();

  scope.addFinalizer(() => {
    log.push("finalized");
  });

  const result = await scope.use(() => {
    log.push("executed");
    return Promise.resolve(ok("result"));
  });

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(log, ["executed", "finalized"]);
});

Deno.test("createScope() close() is idempotent", async () => {
  const log: string[] = [];
  const scope = createScope();

  scope.addFinalizer(() => {
    log.push("finalized");
  });

  await scope.close();
  await scope.close();
  await scope.close();

  assert.assertEquals(log, ["finalized"]);
});

Deno.test("createScope() throws when adding finalizer to closed scope", async () => {
  const scope = createScope();
  await scope.close();

  assert.assertThrows(
    () => scope.addFinalizer(() => {}),
    Error,
    "Cannot add finalizer to closed scope",
  );
});

Deno.test("createScope() collects errors from finalizers", async () => {
  const scope = createScope();

  scope.addFinalizer(() => {
    throw new Error("first error");
  });
  scope.addFinalizer(() => {
    throw new Error("second error");
  });

  await assert.assertRejects(
    () => scope.close(),
    AggregateError,
  );
});

Deno.test("createScope() works with async finalizers", async () => {
  const log: string[] = [];
  const scope = createScope();

  scope.addFinalizer(async () => {
    await Promise.resolve();
    log.push("async finalized");
  });

  await scope.close();

  assert.assertEquals(log, ["async finalized"]);
});

// === scoped() Tests ===

Deno.test("scoped() provides scope and closes it after", async () => {
  const log: string[] = [];

  const result = await scoped((scope) => {
    scope.addFinalizer(() => {
      log.push("finalized");
    });
    log.push("executed");
    return Promise.resolve(ok("result"));
  });

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(log, ["executed", "finalized"]);
});

// === acquireRelease() Tests ===

Deno.test("acquireRelease() registers release with scope", async () => {
  const log: string[] = [];

  await scoped(async (scope) => {
    const result = await acquireRelease(
      scope,
      () => {
        log.push("acquire");
        return ok("resource");
      },
      (resource) => {
        log.push(`release:${resource}`);
      },
    );

    log.push(`use:${isOk(result) ? result.value : "error"}`);
    return ok(undefined);
  });

  assert.assertEquals(log, ["acquire", "use:resource", "release:resource"]);
});

Deno.test("acquireRelease() does not register release on acquire failure", async () => {
  const log: string[] = [];

  await scoped(async (scope) => {
    const result = await acquireRelease(
      scope,
      () => {
        log.push("acquire");
        return fail<string>("acquire-error");
      },
      (_resource: string) => {
        log.push("release");
      },
    );

    log.push(`result:${isFail(result) ? result.error : "ok"}`);
    return ok(undefined);
  });

  assert.assertEquals(log, ["acquire", "result:acquire-error"]);
});

// === ensure() Tests ===

Deno.test("ensure() runs finalizer on success", async () => {
  const log: string[] = [];

  const result = await ensure(
    () => {
      log.push("execute");
      return ok("result");
    },
    () => {
      log.push("finalize");
    },
  );

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(log, ["execute", "finalize"]);
});

Deno.test("ensure() runs finalizer on failure", async () => {
  const log: string[] = [];

  const result = await ensure(
    () => {
      log.push("execute");
      return fail<string>("error");
    },
    () => {
      log.push("finalize");
    },
  );

  assert.assertEquals(isFail(result), true);
  assert.assertEquals(log, ["execute", "finalize"]);
});

// === retry() Tests ===

Deno.test("retry() succeeds on first attempt", async () => {
  let attempts = 0;

  const result = await retry(
    () => {
      attempts++;
      return Promise.resolve(ok("success"));
    },
    3,
  );

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(attempts, 1);
});

Deno.test("retry() retries until success", async () => {
  let attempts = 0;

  const result = await retry(
    () => {
      attempts++;
      if (attempts < 3) {
        return Promise.resolve(fail<string>("not yet"));
      }
      return Promise.resolve(ok("success"));
    },
    5,
  );

  assert.assertEquals(isOk(result), true);
  assert.assertEquals(attempts, 3);
});

Deno.test("retry() returns last failure after all attempts", async () => {
  let attempts = 0;

  const result = await retry(
    () => {
      attempts++;
      return Promise.resolve(fail<string>(`attempt-${attempts}`));
    },
    3,
  );

  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, "attempt-3");
  }
  assert.assertEquals(attempts, 3);
});

Deno.test("retry() respects delay between attempts", async () => {
  const start = Date.now();
  let attempts = 0;

  await retry(
    () => {
      attempts++;
      if (attempts < 3) {
        return Promise.resolve(fail<string>("fail"));
      }
      return Promise.resolve(ok("success"));
    },
    3,
    50, // 50ms delay
  );

  const elapsed = Date.now() - start;
  // Should have at least 2 delays of 50ms each
  assert.assertEquals(elapsed >= 100, true);
});

// === retryWithBackoff() Tests ===

Deno.test("retryWithBackoff() uses exponential delay", async () => {
  const delays: number[] = [];
  let lastTime = Date.now();
  let attempts = 0;

  await retryWithBackoff(
    () => {
      const now = Date.now();
      if (attempts > 0) {
        delays.push(now - lastTime);
      }
      lastTime = now;
      attempts++;
      if (attempts < 4) {
        return Promise.resolve(fail<string>("fail"));
      }
      return Promise.resolve(ok("success"));
    },
    {
      maxAttempts: 5,
      initialDelay: 20,
      factor: 2,
    },
  );

  assert.assertEquals(attempts, 4);
  // Delays should approximately double: ~20, ~40, ~80
  assert.assertEquals(delays.length, 3);
  assert.assertEquals(delays[0]! >= 15, true);
  assert.assertEquals(delays[1]! >= 30, true);
  assert.assertEquals(delays[2]! >= 60, true);
});

Deno.test("retryWithBackoff() respects maxDelay", async () => {
  const delays: number[] = [];
  let lastTime = Date.now();
  let attempts = 0;

  await retryWithBackoff(
    () => {
      const now = Date.now();
      if (attempts > 0) {
        delays.push(now - lastTime);
      }
      lastTime = now;
      attempts++;
      if (attempts < 5) {
        return Promise.resolve(fail<string>("fail"));
      }
      return Promise.resolve(ok("success"));
    },
    {
      maxAttempts: 5,
      initialDelay: 20,
      maxDelay: 50,
      factor: 2,
    },
  );

  // Delays should be capped at 50ms: ~20, ~40, ~50, ~50
  for (const delay of delays.slice(2)) {
    assert.assertEquals(delay <= 70, true); // allow some timing variance
  }
});

// === withTimeout() Tests ===

Deno.test("withTimeout() returns result for fast operation", async () => {
  const result = await withTimeout(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ok("fast");
    },
    100,
    "timeout",
  );

  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, "fast");
  }
});

Deno.test({
  name: "withTimeout() returns timeout error for slow operation",
  fn: async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const result = await withTimeout(
      async () => {
        try {
          await new Promise((resolve, reject) => {
            const id = setTimeout(resolve, 200);
            signal.addEventListener("abort", () => {
              clearTimeout(id);
              reject(new Error("Aborted"));
            });
          });
          return ok("slow");
        } catch {
          return fail("aborted");
        }
      },
      50,
      "operation timed out",
    );

    // Clean up by aborting the slow operation
    controller.abort();

    assert.assertEquals(isFail(result), true);
    if (isFail(result)) {
      assert.assertEquals(result.error, "operation timed out");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
