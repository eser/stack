// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as options from "@eserstack/primitives/options";
import * as results from "@eserstack/primitives/results";

// === Constructor Tests ===

Deno.test("some() creates Some with value", () => {
  const option = options.some("test");
  assert.assertEquals(option._tag, "Some");
  assert.assertEquals(option.value, "test");
});

Deno.test("none is a singleton None", () => {
  assert.assertEquals(options.none._tag, "None");
});

// === fromNullable() Tests ===

Deno.test("fromNullable() returns Some for defined value", () => {
  const option = options.fromNullable("test");
  assert.assertEquals(options.isSome(option), true);
  if (options.isSome(option)) {
    assert.assertEquals(option.value, "test");
  }
});

Deno.test("fromNullable() returns None for null", () => {
  const option = options.fromNullable(null);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromNullable() returns None for undefined", () => {
  const option = options.fromNullable(undefined);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromNullable() returns Some for 0", () => {
  const option = options.fromNullable(0);
  assert.assertEquals(options.isSome(option), true);
  if (options.isSome(option)) {
    assert.assertEquals(option.value, 0);
  }
});

Deno.test("fromNullable() returns Some for empty string", () => {
  const option = options.fromNullable("");
  assert.assertEquals(options.isSome(option), true);
  if (options.isSome(option)) {
    assert.assertEquals(option.value, "");
  }
});

// === fromFalsy() Tests ===

Deno.test("fromFalsy() returns Some for truthy value", () => {
  const option = options.fromFalsy("test");
  assert.assertEquals(options.isSome(option), true);
});

Deno.test("fromFalsy() returns None for null", () => {
  const option = options.fromFalsy(null);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromFalsy() returns None for undefined", () => {
  const option = options.fromFalsy(undefined);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromFalsy() returns None for false", () => {
  const option = options.fromFalsy(false);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromFalsy() returns None for 0", () => {
  const option = options.fromFalsy(0);
  assert.assertEquals(options.isNone(option), true);
});

Deno.test("fromFalsy() returns None for empty string", () => {
  const option = options.fromFalsy("");
  assert.assertEquals(options.isNone(option), true);
});

// === Type Guard Tests ===

Deno.test("isSome() returns true for Some", () => {
  assert.assertEquals(options.isSome(options.some("test")), true);
});

Deno.test("isSome() returns false for None", () => {
  assert.assertEquals(options.isSome(options.none), false);
});

Deno.test("isNone() returns true for None", () => {
  assert.assertEquals(options.isNone(options.none), true);
});

Deno.test("isNone() returns false for Some", () => {
  assert.assertEquals(options.isNone(options.some("test")), false);
});

// === map() Tests ===

Deno.test("map() transforms Some value", () => {
  const option = options.some(5);
  const mapped = options.map(option, (x) => x * 2);
  assert.assertEquals(options.isSome(mapped), true);
  if (options.isSome(mapped)) {
    assert.assertEquals(mapped.value, 10);
  }
});

Deno.test("map() returns None for None", () => {
  const option = options.none;
  const mapped = options.map(option, (x: number) => x * 2);
  assert.assertEquals(options.isNone(mapped), true);
});

// === flatMap() Tests ===

Deno.test("flatMap() chains Some values", () => {
  const option = options.some(5);
  const chained = options.flatMap(option, (x) => options.some(x * 2));
  assert.assertEquals(options.isSome(chained), true);
  if (options.isSome(chained)) {
    assert.assertEquals(chained.value, 10);
  }
});

Deno.test("flatMap() short-circuits on None", () => {
  const option = options.none;
  const chained = options.flatMap(option, (x: number) => options.some(x * 2));
  assert.assertEquals(options.isNone(chained), true);
});

Deno.test("flatMap() propagates inner None", () => {
  const option = options.some(5);
  const chained = options.flatMap(option, (_x) => options.none);
  assert.assertEquals(options.isNone(chained), true);
});

// === filter() Tests ===

Deno.test("filter() keeps Some when predicate is true", () => {
  const option = options.some(10);
  const filtered = options.filter(option, (x) => x > 5);
  assert.assertEquals(options.isSome(filtered), true);
});

Deno.test("filter() returns None when predicate is false", () => {
  const option = options.some(3);
  const filtered = options.filter(option, (x) => x > 5);
  assert.assertEquals(options.isNone(filtered), true);
});

Deno.test("filter() returns None for None", () => {
  const option = options.none;
  const filtered = options.filter(option, (_x: number) => true);
  assert.assertEquals(options.isNone(filtered), true);
});

// === getOrElse() Tests ===

Deno.test("getOrElse() returns value for Some", () => {
  const option = options.some(5);
  assert.assertEquals(options.getOrElse(option, 0), 5);
});

Deno.test("getOrElse() returns fallback for None", () => {
  const option = options.none;
  assert.assertEquals(options.getOrElse(option, 0), 0);
});

Deno.test("getOrElse() calls fallback function for None", () => {
  const option = options.none;
  const fallbackFn = () => 42;
  assert.assertEquals(options.getOrElse(option, fallbackFn), 42);
});

// === getOrNull() Tests ===

Deno.test("getOrNull() returns value for Some", () => {
  const option = options.some("test");
  assert.assertEquals(options.getOrNull(option), "test");
});

Deno.test("getOrNull() returns null for None", () => {
  const option = options.none;
  assert.assertEquals(options.getOrNull(option), null);
});

// === getOrUndefined() Tests ===

Deno.test("getOrUndefined() returns value for Some", () => {
  const option = options.some("test");
  assert.assertEquals(options.getOrUndefined(option), "test");
});

Deno.test("getOrUndefined() returns undefined for None", () => {
  const option = options.none;
  assert.assertEquals(options.getOrUndefined(option), undefined);
});

// === getOrThrow() Tests ===

Deno.test("getOrThrow() returns value for Some", () => {
  const option = options.some("test");
  assert.assertEquals(options.getOrThrow(option), "test");
});

Deno.test("getOrThrow() throws for None with default message", () => {
  assert.assertThrows(
    () => options.getOrThrow(options.none),
    Error,
    "Option is None",
  );
});

Deno.test("getOrThrow() throws for None with custom message", () => {
  assert.assertThrows(
    () => options.getOrThrow(options.none, "Custom error"),
    Error,
    "Custom error",
  );
});

// === match() Tests ===

Deno.test("match() calls some handler for Some", () => {
  const option = options.some(5);
  const matched = options.match(option, {
    some: (v) => `value: ${v}`,
    none: () => "nothing",
  });
  assert.assertEquals(matched, "value: 5");
});

Deno.test("match() calls none handler for None", () => {
  const option = options.none;
  const matched = options.match(option, {
    some: (v: number) => `value: ${v}`,
    none: () => "nothing",
  });
  assert.assertEquals(matched, "nothing");
});

// === toResult() Tests ===

Deno.test("toResult() converts Some to Ok", () => {
  const option = options.some(5);
  const result = options.toResult(option, "error");
  assert.assertEquals(result._tag, "Ok");
  if (result._tag === "Ok") {
    assert.assertEquals(result.value, 5);
  }
});

Deno.test("toResult() converts None to Fail with value error", () => {
  const option = options.none;
  const result = options.toResult(option, "error");
  assert.assertEquals(result._tag, "Fail");
  if (result._tag === "Fail") {
    assert.assertEquals(result.error, "error");
  }
});

Deno.test("toResult() converts None to Fail with function error", () => {
  const option = options.none;
  const result = options.toResult(option, () => "lazy error");
  assert.assertEquals(result._tag, "Fail");
  if (result._tag === "Fail") {
    assert.assertEquals(result.error, "lazy error");
  }
});

// === fromResult() Tests ===

Deno.test("fromResult() converts Ok to Some", () => {
  const result = results.ok(5);
  const option = options.fromResult(result);
  assert.assertEquals(options.isSome(option), true);
  if (options.isSome(option)) {
    assert.assertEquals(option.value, 5);
  }
});

Deno.test("fromResult() converts Fail to None", () => {
  const result = results.fail("error");
  const option = options.fromResult(result);
  assert.assertEquals(options.isNone(option), true);
});

// === all() Tests ===

Deno.test("all() returns Some with array for all Some options", () => {
  const opts = [options.some(1), options.some(2), options.some(3)];
  const combined = options.all(opts);
  assert.assertEquals(options.isSome(combined), true);
  if (options.isSome(combined)) {
    assert.assertEquals(combined.value, [1, 2, 3]);
  }
});

Deno.test("all() returns None if any option is None", () => {
  const opts = [options.some(1), options.none, options.some(3)];
  const combined = options.all(opts);
  assert.assertEquals(options.isNone(combined), true);
});

Deno.test("all() returns Some with empty array for empty input", () => {
  const combined = options.all<number>([]);
  assert.assertEquals(options.isSome(combined), true);
  if (options.isSome(combined)) {
    assert.assertEquals(combined.value, []);
  }
});

// === any() Tests ===

Deno.test("any() returns first Some option", () => {
  const opts = [options.none, options.some(2), options.some(3)];
  const combined = options.any(opts);
  assert.assertEquals(options.isSome(combined), true);
  if (options.isSome(combined)) {
    assert.assertEquals(combined.value, 2);
  }
});

Deno.test("any() returns None if all options are None", () => {
  const opts = [options.none, options.none, options.none];
  const combined = options.any(opts);
  assert.assertEquals(options.isNone(combined), true);
});

Deno.test("any() returns None for empty input", () => {
  const combined = options.any<number>([]);
  assert.assertEquals(options.isNone(combined), true);
});

// === orElse() Tests ===

Deno.test("orElse() returns original Some", () => {
  const option = options.some(5);
  const result = options.orElse(option, options.some(10));
  assert.assertEquals(options.isSome(result), true);
  if (options.isSome(result)) {
    assert.assertEquals(result.value, 5);
  }
});

Deno.test("orElse() returns alternative for None", () => {
  const option = options.none;
  const result = options.orElse(option, options.some(10));
  assert.assertEquals(options.isSome(result), true);
  if (options.isSome(result)) {
    assert.assertEquals(result.value, 10);
  }
});

Deno.test("orElse() calls alternative function for None", () => {
  const option = options.none;
  const result = options.orElse(option, () => options.some(42));
  assert.assertEquals(options.isSome(result), true);
  if (options.isSome(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === tap() Tests ===

Deno.test("tap() calls function for Some and returns same option", () => {
  const option = options.some(5);
  let sideEffect = 0;
  const tapped = options.tap(option, (v) => {
    sideEffect = v;
  });
  assert.assertEquals(sideEffect, 5);
  assert.assertEquals(tapped, option);
});

Deno.test("tap() does not call function for None", () => {
  const option = options.none;
  let called = false;
  const tapped = options.tap(option, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, option);
});

// === tapNone() Tests ===

Deno.test("tapNone() calls function for None and returns same option", () => {
  const option = options.none;
  let called = false;
  const tapped = options.tapNone(option, () => {
    called = true;
  });
  assert.assertEquals(called, true);
  assert.assertEquals(tapped, option);
});

Deno.test("tapNone() does not call function for Some", () => {
  const option = options.some(5);
  let called = false;
  const tapped = options.tapNone(option, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, option);
});

// === zip() Tests ===

Deno.test("zip() combines two Some options", () => {
  const optionA = options.some(1);
  const optionB = options.some("a");
  const zipped = options.zip(optionA, optionB);
  assert.assertEquals(options.isSome(zipped), true);
  if (options.isSome(zipped)) {
    assert.assertEquals(zipped.value, [1, "a"]);
  }
});

Deno.test("zip() returns None if first is None", () => {
  const optionA = options.none;
  const optionB = options.some("a");
  const zipped = options.zip(optionA, optionB);
  assert.assertEquals(options.isNone(zipped), true);
});

Deno.test("zip() returns None if second is None", () => {
  const optionA = options.some(1);
  const optionB = options.none;
  const zipped = options.zip(optionA, optionB);
  assert.assertEquals(options.isNone(zipped), true);
});

// === zipWith() Tests ===

Deno.test("zipWith() combines two Some options with function", () => {
  const optionA = options.some(1);
  const optionB = options.some(2);
  const zipped = options.zipWith(optionA, optionB, (a, b) => a + b);
  assert.assertEquals(options.isSome(zipped), true);
  if (options.isSome(zipped)) {
    assert.assertEquals(zipped.value, 3);
  }
});

Deno.test("zipWith() returns None if any option is None", () => {
  const optionA = options.some(1);
  const optionB = options.none;
  const zipped = options.zipWith(
    optionA,
    optionB,
    (a: number, b: number) => a + b,
  );
  assert.assertEquals(options.isNone(zipped), true);
});

// === contains() Tests ===

Deno.test("contains() returns true when Some contains value", () => {
  const option = options.some(5);
  assert.assertEquals(options.contains(option, 5), true);
});

Deno.test("contains() returns false when Some does not contain value", () => {
  const option = options.some(5);
  assert.assertEquals(options.contains(option, 10), false);
});

Deno.test("contains() returns false for None", () => {
  const option = options.none;
  assert.assertEquals(options.contains(option, 5), false);
});

// === exists() Tests ===

Deno.test("exists() returns true when predicate matches Some", () => {
  const option = options.some(10);
  assert.assertEquals(options.exists(option, (x) => x > 5), true);
});

Deno.test("exists() returns false when predicate does not match Some", () => {
  const option = options.some(3);
  assert.assertEquals(options.exists(option, (x) => x > 5), false);
});

Deno.test("exists() returns false for None", () => {
  const option = options.none;
  assert.assertEquals(options.exists(option, (_x: number) => true), false);
});
