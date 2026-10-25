// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";

// === Constructor Tests ===

nodeTest.test("ok() creates Ok result with value", () => {
  const result = results.ok("test");
  assert.assertEquals(result._tag, "Ok");
  assert.assertEquals(result.value, "test");
});

nodeTest.test("fail() creates Fail result with error", () => {
  const error = new Error("test error");
  const result = results.fail(error);
  assert.assertEquals(result._tag, "Fail");
  assert.assertEquals(result.error, error);
});

nodeTest.test("fail() works with non-Error types", () => {
  const result = results.fail("string error");
  assert.assertEquals(result._tag, "Fail");
  assert.assertEquals(result.error, "string error");
});

// === Type Guard Tests ===

nodeTest.test("isOk() returns true for Ok", () => {
  const result = results.ok("test");
  assert.assertEquals(results.isOk(result), true);
});

nodeTest.test("isOk() returns false for Fail", () => {
  const result = results.fail(new Error("test"));
  assert.assertEquals(results.isOk(result), false);
});

nodeTest.test("isFail() returns true for Fail", () => {
  const result = results.fail(new Error("test"));
  assert.assertEquals(results.isFail(result), true);
});

nodeTest.test("isFail() returns false for Ok", () => {
  const result = results.ok("test");
  assert.assertEquals(results.isFail(result), false);
});

// === results.map() Tests ===

nodeTest.test("map() transforms Ok value", () => {
  const result = results.ok(5);
  const mapped = results.map(result, (x) => x * 2);
  assert.assertEquals(results.isOk(mapped), true);
  if (results.isOk(mapped)) {
    assert.assertEquals(mapped.value, 10);
  }
});

nodeTest.test("map() passes through Fail unchanged", () => {
  const error = new Error("test");
  const result = results.fail<Error>(error);
  const mapped = results.map(result, (x: number) => x * 2);
  assert.assertEquals(results.isFail(mapped), true);
  if (results.isFail(mapped)) {
    assert.assertEquals(mapped.error, error);
  }
});

// === results.flatMap() Tests ===

nodeTest.test("results.flatMap() chains Ok results", () => {
  const result = results.ok(5);
  const chained = results.flatMap(result, (x) => results.ok(x * 2));
  assert.assertEquals(results.isOk(chained), true);
  if (results.isOk(chained)) {
    assert.assertEquals(chained.value, 10);
  }
});

nodeTest.test("results.flatMap() short-circuits on Fail", () => {
  const error = new Error("test");
  const result = results.fail<Error>(error);
  const chained = results.flatMap(result, (x: number) => results.ok(x * 2));
  assert.assertEquals(results.isFail(chained), true);
});

nodeTest.test("results.flatMap() propagates inner Fail", () => {
  const result = results.ok(5);
  const innerError = new Error("inner");
  const chained = results.flatMap(result, (_x) => results.fail(innerError));
  assert.assertEquals(results.isFail(chained), true);
  if (results.isFail(chained)) {
    assert.assertEquals(chained.error, innerError);
  }
});

// === results.mapError() Tests ===

nodeTest.test("results.mapError() transforms Fail error", () => {
  const result = results.fail<string>("error");
  const mapped = results.mapError(result, (e) => new Error(e));
  assert.assertEquals(results.isFail(mapped), true);
  if (results.isFail(mapped)) {
    assert.assertInstanceOf(mapped.error, Error);
    assert.assertEquals(mapped.error.message, "error");
  }
});

nodeTest.test("results.mapError() passes through Ok unchanged", () => {
  const result = results.ok(5) as results.Result<number, string>;
  const mapped = results.mapError(result, (e) => new Error(e));
  assert.assertEquals(results.isOk(mapped), true);
  if (results.isOk(mapped)) {
    assert.assertEquals(mapped.value, 5);
  }
});

// === results.flatMapError() Tests ===

nodeTest.test("results.flatMapError() chains Fail results", () => {
  const result = results.fail("recoverable") as results.Result<number, string>;
  const recovered = results.flatMapError(
    result,
    (_e) => results.ok(42) as results.Result<number, never>,
  );
  assert.assertEquals(results.isOk(recovered), true);
  if (results.isOk(recovered)) {
    assert.assertEquals(recovered.value, 42);
  }
});

nodeTest.test("results.flatMapError() passes through Ok unchanged", () => {
  const result = results.ok(5) as results.Result<number, string>;
  const recovered = results.flatMapError(
    result,
    (_e) => results.ok(42) as results.Result<number, never>,
  );
  assert.assertEquals(results.isOk(recovered), true);
  if (results.isOk(recovered)) {
    assert.assertEquals(recovered.value, 5);
  }
});

// === results.getOrElse() Tests ===

nodeTest.test("results.getOrElse() returns value for Ok", () => {
  const result = results.ok(5);
  assert.assertEquals(results.getOrElse(result, 0), 5);
});

nodeTest.test("results.getOrElse() returns fallback for Fail", () => {
  const result = results.fail<Error>(new Error("test"));
  assert.assertEquals(results.getOrElse(result, 0), 0);
});

nodeTest.test("results.getOrElse() calls fallback function for Fail", () => {
  const result = results.fail<string>("error");
  const fallbackFn = (e: string) => e.length;
  assert.assertEquals(results.getOrElse(result, fallbackFn), 5);
});

// === results.getOrThrow() Tests ===

nodeTest.test("results.getOrThrow() returns value for Ok", () => {
  const result = results.ok("test");
  assert.assertEquals(results.getOrThrow(result), "test");
});

nodeTest.test("results.getOrThrow() throws Error for Fail with Error", () => {
  const error = new Error("test error");
  const result = results.fail(error);
  assert.assertThrows(() => results.getOrThrow(result), Error, "test error");
});

nodeTest.test("results.getOrThrow() wraps non-Error in Error for Fail", () => {
  const result = results.fail("string error");
  assert.assertThrows(() => results.getOrThrow(result), Error, "string error");
});

// === results.getOrNull() Tests ===

nodeTest.test("results.getOrNull() returns value for Ok", () => {
  const result = results.ok("test");
  assert.assertEquals(results.getOrNull(result), "test");
});

nodeTest.test("results.getOrNull() returns null for Fail", () => {
  const result = results.fail(new Error("test"));
  assert.assertEquals(results.getOrNull(result), null);
});

// === results.getOrUndefined() Tests ===

nodeTest.test("results.getOrUndefined() returns value for Ok", () => {
  const result = results.ok("test");
  assert.assertEquals(results.getOrUndefined(result), "test");
});

nodeTest.test("results.getOrUndefined() returns undefined for Fail", () => {
  const result = results.fail(new Error("test"));
  assert.assertEquals(results.getOrUndefined(result), undefined);
});

// === results.match() Tests ===

nodeTest.test("match() calls ok handler for Ok", () => {
  const result = results.ok(5);
  const matched = results.match(result, {
    ok: (v) => `value: ${v}`,
    fail: (e) => `error: ${e}`,
  });
  assert.assertEquals(matched, "value: 5");
});

nodeTest.test("match() calls fail handler for Fail", () => {
  const result = results.fail<string>("oops");
  const matched = results.match(result, {
    ok: (v: number) => `value: ${v}`,
    fail: (e) => `error: ${e}`,
  });
  assert.assertEquals(matched, "error: oops");
});

// === results.fromPromise() Tests ===

nodeTest.test(
  "results.fromPromise() returns Ok for resolved Promise",
  async () => {
    const promise = Promise.resolve("test");
    const result = await results.fromPromise(promise);
    assert.assertEquals(results.isOk(result), true);
    if (results.isOk(result)) {
      assert.assertEquals(result.value, "test");
    }
  },
);

nodeTest.test(
  "results.fromPromise() returns Fail for rejected Promise",
  async () => {
    const error = new Error("test error");
    const promise = Promise.reject(error);
    const result = await results.fromPromise(promise);
    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertEquals(result.error, error);
    }
  },
);

nodeTest.test("results.fromPromise() uses custom error mapper", async () => {
  const promise = Promise.reject("string error");
  const result = await results.fromPromise(
    promise,
    (e) => new Error(String(e)),
  );
  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
  }
});

// === results.toPromise() Tests ===

nodeTest.test("results.toPromise() resolves for Ok", async () => {
  const result = results.ok("test");
  const value = await results.toPromise(result);
  assert.assertEquals(value, "test");
});

nodeTest.test("results.toPromise() rejects for Fail with Error", async () => {
  const error = new Error("test error");
  const result = results.fail(error);
  await assert.assertRejects(
    () => results.toPromise(result),
    Error,
    "test error",
  );
});

nodeTest.test("results.toPromise() wraps non-Error for Fail", async () => {
  const result = results.fail("string error");
  await assert.assertRejects(
    () => results.toPromise(result),
    Error,
    "string error",
  );
});

// === results.all() Tests ===

nodeTest.test("all() returns Ok with array for all Ok results", () => {
  const items = [results.ok(1), results.ok(2), results.ok(3)];
  const combined = results.all(items);
  assert.assertEquals(results.isOk(combined), true);
  if (results.isOk(combined)) {
    assert.assertEquals(combined.value, [1, 2, 3]);
  }
});

nodeTest.test("all() returns first Fail for any Fail result", () => {
  const error = new Error("second failed");
  const items = [results.ok(1), results.fail(error), results.ok(3)];
  const combined = results.all(items);
  assert.assertEquals(results.isFail(combined), true);
  if (results.isFail(combined)) {
    assert.assertEquals(combined.error, error);
  }
});

nodeTest.test("all() returns Ok with empty array for empty input", () => {
  const combined = results.all<number, Error>([]);
  assert.assertEquals(results.isOk(combined), true);
  if (results.isOk(combined)) {
    assert.assertEquals(combined.value, []);
  }
});

// === results.any() Tests ===

nodeTest.test("any() returns first Ok result", () => {
  const items = [results.fail<string>("first"), results.ok(2), results.ok(3)];
  const combined = results.any(items);
  assert.assertEquals(results.isOk(combined), true);
  if (results.isOk(combined)) {
    assert.assertEquals(combined.value, 2);
  }
});

nodeTest.test("any() returns Fail with all errors if all fail", () => {
  const items = [
    results.fail("first"),
    results.fail("second"),
    results.fail("third"),
  ];
  const combined = results.any(items);
  assert.assertEquals(results.isFail(combined), true);
  if (results.isFail(combined)) {
    assert.assertEquals(combined.error, ["first", "second", "third"]);
  }
});

nodeTest.test("any() returns Fail with empty array for empty input", () => {
  const combined = results.any<number, string>([]);
  assert.assertEquals(results.isFail(combined), true);
  if (results.isFail(combined)) {
    assert.assertEquals(combined.error, []);
  }
});

// === results.tryCatch() Tests ===

nodeTest.test("results.tryCatch() returns Ok for successful function", () => {
  const result = results.tryCatch(() => 5 + 5);
  assert.assertEquals(results.isOk(result), true);
  if (results.isOk(result)) {
    assert.assertEquals(result.value, 10);
  }
});

nodeTest.test("results.tryCatch() returns Fail for throwing function", () => {
  const error = new Error("test error");
  const result = results.tryCatch(() => {
    throw error;
  });
  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, error);
  }
});

nodeTest.test("results.tryCatch() uses custom error mapper", () => {
  const result = results.tryCatch(
    () => {
      // The mapper exists for non-Error throws, so the test throws a string.
      // oxlint-disable-next-line no-throw-literal
      throw "string error";
    },
    (e) => new Error(String(e)),
  );
  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
  }
});

// === results.tryCatchAsync() Tests ===

nodeTest.test(
  "results.tryCatchAsync() returns Ok for successful async function",
  async () => {
    const result = await results.tryCatchAsync(async () => {
      await Promise.resolve();
      return 10;
    });
    assert.assertEquals(results.isOk(result), true);
    if (results.isOk(result)) {
      assert.assertEquals(result.value, 10);
    }
  },
);

nodeTest.test(
  "results.tryCatchAsync() returns Fail for throwing async function",
  async () => {
    const error = new Error("async error");
    const result = await results.tryCatchAsync(async () => {
      await Promise.resolve();
      throw error;
    });
    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertEquals(result.error, error);
    }
  },
);

// === results.tap() Tests ===

nodeTest.test("tap() calls function for Ok and returns same result", () => {
  const result = results.ok(5);
  let sideEffect = 0;
  const tapped = results.tap(result, (v) => {
    sideEffect = v;
  });
  assert.assertEquals(sideEffect, 5);
  assert.assertEquals(tapped, result);
});

nodeTest.test("tap() does not call function for Fail", () => {
  const result = results.fail<Error>(new Error("test"));
  let called = false;
  const tapped = results.tap(result, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, result);
});

// === results.tapError() Tests ===

nodeTest.test(
  "results.tapError() calls function for Fail and returns same result",
  () => {
    const error = new Error("test");
    const result = results.fail(error);
    let sideEffect: Error | null = null;
    const tapped = results.tapError(result, (e) => {
      sideEffect = e;
    });
    assert.assertEquals(sideEffect, error);
    assert.assertEquals(tapped, result);
  },
);

nodeTest.test("results.tapError() does not call function for Ok", () => {
  const result = results.ok(5);
  let called = false;
  const tapped = results.tapError(result, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, result);
});
