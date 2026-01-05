// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  all,
  any,
  fail,
  flatMap,
  flatMapError,
  fromPromise,
  getOrElse,
  getOrNull,
  getOrThrow,
  getOrUndefined,
  isFail,
  isOk,
  map,
  mapError,
  match,
  ok,
  type Result,
  tap,
  tapError,
  toPromise,
  tryCatch,
  tryCatchAsync,
} from "./results.ts";

// === Constructor Tests ===

Deno.test("ok() creates Ok result with value", () => {
  const result = ok("test");
  assert.assertEquals(result._tag, "Ok");
  assert.assertEquals(result.value, "test");
});

Deno.test("fail() creates Fail result with error", () => {
  const error = new Error("test error");
  const result = fail(error);
  assert.assertEquals(result._tag, "Fail");
  assert.assertEquals(result.error, error);
});

Deno.test("fail() works with non-Error types", () => {
  const result = fail("string error");
  assert.assertEquals(result._tag, "Fail");
  assert.assertEquals(result.error, "string error");
});

// === Type Guard Tests ===

Deno.test("isOk() returns true for Ok", () => {
  const result = ok("test");
  assert.assertEquals(isOk(result), true);
});

Deno.test("isOk() returns false for Fail", () => {
  const result = fail(new Error("test"));
  assert.assertEquals(isOk(result), false);
});

Deno.test("isFail() returns true for Fail", () => {
  const result = fail(new Error("test"));
  assert.assertEquals(isFail(result), true);
});

Deno.test("isFail() returns false for Ok", () => {
  const result = ok("test");
  assert.assertEquals(isFail(result), false);
});

// === map() Tests ===

Deno.test("map() transforms Ok value", () => {
  const result = ok(5);
  const mapped = map(result, (x) => x * 2);
  assert.assertEquals(isOk(mapped), true);
  if (isOk(mapped)) {
    assert.assertEquals(mapped.value, 10);
  }
});

Deno.test("map() passes through Fail unchanged", () => {
  const error = new Error("test");
  const result = fail<Error>(error);
  const mapped = map(result, (x: number) => x * 2);
  assert.assertEquals(isFail(mapped), true);
  if (isFail(mapped)) {
    assert.assertEquals(mapped.error, error);
  }
});

// === flatMap() Tests ===

Deno.test("flatMap() chains Ok results", () => {
  const result = ok(5);
  const chained = flatMap(result, (x) => ok(x * 2));
  assert.assertEquals(isOk(chained), true);
  if (isOk(chained)) {
    assert.assertEquals(chained.value, 10);
  }
});

Deno.test("flatMap() short-circuits on Fail", () => {
  const error = new Error("test");
  const result = fail<Error>(error);
  const chained = flatMap(result, (x: number) => ok(x * 2));
  assert.assertEquals(isFail(chained), true);
});

Deno.test("flatMap() propagates inner Fail", () => {
  const result = ok(5);
  const innerError = new Error("inner");
  const chained = flatMap(result, (_x) => fail(innerError));
  assert.assertEquals(isFail(chained), true);
  if (isFail(chained)) {
    assert.assertEquals(chained.error, innerError);
  }
});

// === mapError() Tests ===

Deno.test("mapError() transforms Fail error", () => {
  const result = fail<string>("error");
  const mapped = mapError(result, (e) => new Error(e));
  assert.assertEquals(isFail(mapped), true);
  if (isFail(mapped)) {
    assert.assertInstanceOf(mapped.error, Error);
    assert.assertEquals(mapped.error.message, "error");
  }
});

Deno.test("mapError() passes through Ok unchanged", () => {
  const result = ok(5) as Result<number, string>;
  const mapped = mapError(result, (e) => new Error(e));
  assert.assertEquals(isOk(mapped), true);
  if (isOk(mapped)) {
    assert.assertEquals(mapped.value, 5);
  }
});

// === flatMapError() Tests ===

Deno.test("flatMapError() chains Fail results", () => {
  const result = fail("recoverable") as Result<number, string>;
  const recovered = flatMapError(
    result,
    (_e) => ok(42) as Result<number, never>,
  );
  assert.assertEquals(isOk(recovered), true);
  if (isOk(recovered)) {
    assert.assertEquals(recovered.value, 42);
  }
});

Deno.test("flatMapError() passes through Ok unchanged", () => {
  const result = ok(5) as Result<number, string>;
  const recovered = flatMapError(
    result,
    (_e) => ok(42) as Result<number, never>,
  );
  assert.assertEquals(isOk(recovered), true);
  if (isOk(recovered)) {
    assert.assertEquals(recovered.value, 5);
  }
});

// === getOrElse() Tests ===

Deno.test("getOrElse() returns value for Ok", () => {
  const result = ok(5);
  assert.assertEquals(getOrElse(result, 0), 5);
});

Deno.test("getOrElse() returns fallback for Fail", () => {
  const result = fail<Error>(new Error("test"));
  assert.assertEquals(getOrElse(result, 0), 0);
});

Deno.test("getOrElse() calls fallback function for Fail", () => {
  const result = fail<string>("error");
  const fallbackFn = (e: string) => e.length;
  assert.assertEquals(getOrElse(result, fallbackFn), 5);
});

// === getOrThrow() Tests ===

Deno.test("getOrThrow() returns value for Ok", () => {
  const result = ok("test");
  assert.assertEquals(getOrThrow(result), "test");
});

Deno.test("getOrThrow() throws Error for Fail with Error", () => {
  const error = new Error("test error");
  const result = fail(error);
  assert.assertThrows(() => getOrThrow(result), Error, "test error");
});

Deno.test("getOrThrow() wraps non-Error in Error for Fail", () => {
  const result = fail("string error");
  assert.assertThrows(() => getOrThrow(result), Error, "string error");
});

// === getOrNull() Tests ===

Deno.test("getOrNull() returns value for Ok", () => {
  const result = ok("test");
  assert.assertEquals(getOrNull(result), "test");
});

Deno.test("getOrNull() returns null for Fail", () => {
  const result = fail(new Error("test"));
  assert.assertEquals(getOrNull(result), null);
});

// === getOrUndefined() Tests ===

Deno.test("getOrUndefined() returns value for Ok", () => {
  const result = ok("test");
  assert.assertEquals(getOrUndefined(result), "test");
});

Deno.test("getOrUndefined() returns undefined for Fail", () => {
  const result = fail(new Error("test"));
  assert.assertEquals(getOrUndefined(result), undefined);
});

// === match() Tests ===

Deno.test("match() calls ok handler for Ok", () => {
  const result = ok(5);
  const matched = match(result, {
    ok: (v) => `value: ${v}`,
    fail: (e) => `error: ${e}`,
  });
  assert.assertEquals(matched, "value: 5");
});

Deno.test("match() calls fail handler for Fail", () => {
  const result = fail<string>("oops");
  const matched = match(result, {
    ok: (v: number) => `value: ${v}`,
    fail: (e) => `error: ${e}`,
  });
  assert.assertEquals(matched, "error: oops");
});

// === fromPromise() Tests ===

Deno.test("fromPromise() returns Ok for resolved Promise", async () => {
  const promise = Promise.resolve("test");
  const result = await fromPromise(promise);
  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, "test");
  }
});

Deno.test("fromPromise() returns Fail for rejected Promise", async () => {
  const error = new Error("test error");
  const promise = Promise.reject(error);
  const result = await fromPromise(promise);
  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, error);
  }
});

Deno.test("fromPromise() uses custom error mapper", async () => {
  const promise = Promise.reject("string error");
  const result = await fromPromise(promise, (e) => new Error(String(e)));
  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
  }
});

// === toPromise() Tests ===

Deno.test("toPromise() resolves for Ok", async () => {
  const result = ok("test");
  const value = await toPromise(result);
  assert.assertEquals(value, "test");
});

Deno.test("toPromise() rejects for Fail with Error", async () => {
  const error = new Error("test error");
  const result = fail(error);
  await assert.assertRejects(
    () => toPromise(result),
    Error,
    "test error",
  );
});

Deno.test("toPromise() wraps non-Error for Fail", async () => {
  const result = fail("string error");
  await assert.assertRejects(
    () => toPromise(result),
    Error,
    "string error",
  );
});

// === all() Tests ===

Deno.test("all() returns Ok with array for all Ok results", () => {
  const results = [ok(1), ok(2), ok(3)];
  const combined = all(results);
  assert.assertEquals(isOk(combined), true);
  if (isOk(combined)) {
    assert.assertEquals(combined.value, [1, 2, 3]);
  }
});

Deno.test("all() returns first Fail for any Fail result", () => {
  const error = new Error("second failed");
  const results = [ok(1), fail(error), ok(3)];
  const combined = all(results);
  assert.assertEquals(isFail(combined), true);
  if (isFail(combined)) {
    assert.assertEquals(combined.error, error);
  }
});

Deno.test("all() returns Ok with empty array for empty input", () => {
  const combined = all<number, Error>([]);
  assert.assertEquals(isOk(combined), true);
  if (isOk(combined)) {
    assert.assertEquals(combined.value, []);
  }
});

// === any() Tests ===

Deno.test("any() returns first Ok result", () => {
  const results = [fail<string>("first"), ok(2), ok(3)];
  const combined = any(results);
  assert.assertEquals(isOk(combined), true);
  if (isOk(combined)) {
    assert.assertEquals(combined.value, 2);
  }
});

Deno.test("any() returns Fail with all errors if all fail", () => {
  const results = [fail("first"), fail("second"), fail("third")];
  const combined = any(results);
  assert.assertEquals(isFail(combined), true);
  if (isFail(combined)) {
    assert.assertEquals(combined.error, ["first", "second", "third"]);
  }
});

Deno.test("any() returns Fail with empty array for empty input", () => {
  const combined = any<number, string>([]);
  assert.assertEquals(isFail(combined), true);
  if (isFail(combined)) {
    assert.assertEquals(combined.error, []);
  }
});

// === tryCatch() Tests ===

Deno.test("tryCatch() returns Ok for successful function", () => {
  const result = tryCatch(() => 5 + 5);
  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 10);
  }
});

Deno.test("tryCatch() returns Fail for throwing function", () => {
  const error = new Error("test error");
  const result = tryCatch(() => {
    throw error;
  });
  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, error);
  }
});

Deno.test("tryCatch() uses custom error mapper", () => {
  const result = tryCatch(
    () => {
      throw "string error";
    },
    (e) => new Error(String(e)),
  );
  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertInstanceOf(result.error, Error);
  }
});

// === tryCatchAsync() Tests ===

Deno.test("tryCatchAsync() returns Ok for successful async function", async () => {
  const result = await tryCatchAsync(async () => {
    await Promise.resolve();
    return 10;
  });
  assert.assertEquals(isOk(result), true);
  if (isOk(result)) {
    assert.assertEquals(result.value, 10);
  }
});

Deno.test("tryCatchAsync() returns Fail for throwing async function", async () => {
  const error = new Error("async error");
  const result = await tryCatchAsync(async () => {
    await Promise.resolve();
    throw error;
  });
  assert.assertEquals(isFail(result), true);
  if (isFail(result)) {
    assert.assertEquals(result.error, error);
  }
});

// === tap() Tests ===

Deno.test("tap() calls function for Ok and returns same result", () => {
  const result = ok(5);
  let sideEffect = 0;
  const tapped = tap(result, (v) => {
    sideEffect = v;
  });
  assert.assertEquals(sideEffect, 5);
  assert.assertEquals(tapped, result);
});

Deno.test("tap() does not call function for Fail", () => {
  const result = fail<Error>(new Error("test"));
  let called = false;
  const tapped = tap(result, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, result);
});

// === tapError() Tests ===

Deno.test("tapError() calls function for Fail and returns same result", () => {
  const error = new Error("test");
  const result = fail(error);
  let sideEffect: Error | null = null;
  const tapped = tapError(result, (e) => {
    sideEffect = e;
  });
  assert.assertEquals(sideEffect, error);
  assert.assertEquals(tapped, result);
});

Deno.test("tapError() does not call function for Ok", () => {
  const result = ok(5);
  let called = false;
  const tapped = tapError(result, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, result);
});
