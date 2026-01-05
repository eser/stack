// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  all,
  any,
  contains,
  exists,
  filter,
  flatMap,
  fromFalsy,
  fromNullable,
  fromResult,
  getOrElse,
  getOrNull,
  getOrThrow,
  getOrUndefined,
  isNone,
  isSome,
  map,
  match,
  none,
  orElse,
  some,
  tap,
  tapNone,
  toResult,
  zip,
  zipWith,
} from "./options.ts";
import { fail, ok } from "./results.ts";

// === Constructor Tests ===

Deno.test("some() creates Some with value", () => {
  const option = some("test");
  assert.assertEquals(option._tag, "Some");
  assert.assertEquals(option.value, "test");
});

Deno.test("none is a singleton None", () => {
  assert.assertEquals(none._tag, "None");
});

// === fromNullable() Tests ===

Deno.test("fromNullable() returns Some for defined value", () => {
  const option = fromNullable("test");
  assert.assertEquals(isSome(option), true);
  if (isSome(option)) {
    assert.assertEquals(option.value, "test");
  }
});

Deno.test("fromNullable() returns None for null", () => {
  const option = fromNullable(null);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromNullable() returns None for undefined", () => {
  const option = fromNullable(undefined);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromNullable() returns Some for 0", () => {
  const option = fromNullable(0);
  assert.assertEquals(isSome(option), true);
  if (isSome(option)) {
    assert.assertEquals(option.value, 0);
  }
});

Deno.test("fromNullable() returns Some for empty string", () => {
  const option = fromNullable("");
  assert.assertEquals(isSome(option), true);
  if (isSome(option)) {
    assert.assertEquals(option.value, "");
  }
});

// === fromFalsy() Tests ===

Deno.test("fromFalsy() returns Some for truthy value", () => {
  const option = fromFalsy("test");
  assert.assertEquals(isSome(option), true);
});

Deno.test("fromFalsy() returns None for null", () => {
  const option = fromFalsy(null);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromFalsy() returns None for undefined", () => {
  const option = fromFalsy(undefined);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromFalsy() returns None for false", () => {
  const option = fromFalsy(false);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromFalsy() returns None for 0", () => {
  const option = fromFalsy(0);
  assert.assertEquals(isNone(option), true);
});

Deno.test("fromFalsy() returns None for empty string", () => {
  const option = fromFalsy("");
  assert.assertEquals(isNone(option), true);
});

// === Type Guard Tests ===

Deno.test("isSome() returns true for Some", () => {
  assert.assertEquals(isSome(some("test")), true);
});

Deno.test("isSome() returns false for None", () => {
  assert.assertEquals(isSome(none), false);
});

Deno.test("isNone() returns true for None", () => {
  assert.assertEquals(isNone(none), true);
});

Deno.test("isNone() returns false for Some", () => {
  assert.assertEquals(isNone(some("test")), false);
});

// === map() Tests ===

Deno.test("map() transforms Some value", () => {
  const option = some(5);
  const mapped = map(option, (x) => x * 2);
  assert.assertEquals(isSome(mapped), true);
  if (isSome(mapped)) {
    assert.assertEquals(mapped.value, 10);
  }
});

Deno.test("map() returns None for None", () => {
  const option = none;
  const mapped = map(option, (x: number) => x * 2);
  assert.assertEquals(isNone(mapped), true);
});

// === flatMap() Tests ===

Deno.test("flatMap() chains Some values", () => {
  const option = some(5);
  const chained = flatMap(option, (x) => some(x * 2));
  assert.assertEquals(isSome(chained), true);
  if (isSome(chained)) {
    assert.assertEquals(chained.value, 10);
  }
});

Deno.test("flatMap() short-circuits on None", () => {
  const option = none;
  const chained = flatMap(option, (x: number) => some(x * 2));
  assert.assertEquals(isNone(chained), true);
});

Deno.test("flatMap() propagates inner None", () => {
  const option = some(5);
  const chained = flatMap(option, (_x) => none);
  assert.assertEquals(isNone(chained), true);
});

// === filter() Tests ===

Deno.test("filter() keeps Some when predicate is true", () => {
  const option = some(10);
  const filtered = filter(option, (x) => x > 5);
  assert.assertEquals(isSome(filtered), true);
});

Deno.test("filter() returns None when predicate is false", () => {
  const option = some(3);
  const filtered = filter(option, (x) => x > 5);
  assert.assertEquals(isNone(filtered), true);
});

Deno.test("filter() returns None for None", () => {
  const option = none;
  const filtered = filter(option, (_x: number) => true);
  assert.assertEquals(isNone(filtered), true);
});

// === getOrElse() Tests ===

Deno.test("getOrElse() returns value for Some", () => {
  const option = some(5);
  assert.assertEquals(getOrElse(option, 0), 5);
});

Deno.test("getOrElse() returns fallback for None", () => {
  const option = none;
  assert.assertEquals(getOrElse(option, 0), 0);
});

Deno.test("getOrElse() calls fallback function for None", () => {
  const option = none;
  const fallbackFn = () => 42;
  assert.assertEquals(getOrElse(option, fallbackFn), 42);
});

// === getOrNull() Tests ===

Deno.test("getOrNull() returns value for Some", () => {
  const option = some("test");
  assert.assertEquals(getOrNull(option), "test");
});

Deno.test("getOrNull() returns null for None", () => {
  const option = none;
  assert.assertEquals(getOrNull(option), null);
});

// === getOrUndefined() Tests ===

Deno.test("getOrUndefined() returns value for Some", () => {
  const option = some("test");
  assert.assertEquals(getOrUndefined(option), "test");
});

Deno.test("getOrUndefined() returns undefined for None", () => {
  const option = none;
  assert.assertEquals(getOrUndefined(option), undefined);
});

// === getOrThrow() Tests ===

Deno.test("getOrThrow() returns value for Some", () => {
  const option = some("test");
  assert.assertEquals(getOrThrow(option), "test");
});

Deno.test("getOrThrow() throws for None with default message", () => {
  assert.assertThrows(() => getOrThrow(none), Error, "Option is None");
});

Deno.test("getOrThrow() throws for None with custom message", () => {
  assert.assertThrows(
    () => getOrThrow(none, "Custom error"),
    Error,
    "Custom error",
  );
});

// === match() Tests ===

Deno.test("match() calls some handler for Some", () => {
  const option = some(5);
  const matched = match(option, {
    some: (v) => `value: ${v}`,
    none: () => "nothing",
  });
  assert.assertEquals(matched, "value: 5");
});

Deno.test("match() calls none handler for None", () => {
  const option = none;
  const matched = match(option, {
    some: (v: number) => `value: ${v}`,
    none: () => "nothing",
  });
  assert.assertEquals(matched, "nothing");
});

// === toResult() Tests ===

Deno.test("toResult() converts Some to Ok", () => {
  const option = some(5);
  const result = toResult(option, "error");
  assert.assertEquals(result._tag, "Ok");
  if (result._tag === "Ok") {
    assert.assertEquals(result.value, 5);
  }
});

Deno.test("toResult() converts None to Fail with value error", () => {
  const option = none;
  const result = toResult(option, "error");
  assert.assertEquals(result._tag, "Fail");
  if (result._tag === "Fail") {
    assert.assertEquals(result.error, "error");
  }
});

Deno.test("toResult() converts None to Fail with function error", () => {
  const option = none;
  const result = toResult(option, () => "lazy error");
  assert.assertEquals(result._tag, "Fail");
  if (result._tag === "Fail") {
    assert.assertEquals(result.error, "lazy error");
  }
});

// === fromResult() Tests ===

Deno.test("fromResult() converts Ok to Some", () => {
  const result = ok(5);
  const option = fromResult(result);
  assert.assertEquals(isSome(option), true);
  if (isSome(option)) {
    assert.assertEquals(option.value, 5);
  }
});

Deno.test("fromResult() converts Fail to None", () => {
  const result = fail("error");
  const option = fromResult(result);
  assert.assertEquals(isNone(option), true);
});

// === all() Tests ===

Deno.test("all() returns Some with array for all Some options", () => {
  const options = [some(1), some(2), some(3)];
  const combined = all(options);
  assert.assertEquals(isSome(combined), true);
  if (isSome(combined)) {
    assert.assertEquals(combined.value, [1, 2, 3]);
  }
});

Deno.test("all() returns None if any option is None", () => {
  const options = [some(1), none, some(3)];
  const combined = all(options);
  assert.assertEquals(isNone(combined), true);
});

Deno.test("all() returns Some with empty array for empty input", () => {
  const combined = all<number>([]);
  assert.assertEquals(isSome(combined), true);
  if (isSome(combined)) {
    assert.assertEquals(combined.value, []);
  }
});

// === any() Tests ===

Deno.test("any() returns first Some option", () => {
  const options = [none, some(2), some(3)];
  const combined = any(options);
  assert.assertEquals(isSome(combined), true);
  if (isSome(combined)) {
    assert.assertEquals(combined.value, 2);
  }
});

Deno.test("any() returns None if all options are None", () => {
  const options = [none, none, none];
  const combined = any(options);
  assert.assertEquals(isNone(combined), true);
});

Deno.test("any() returns None for empty input", () => {
  const combined = any<number>([]);
  assert.assertEquals(isNone(combined), true);
});

// === orElse() Tests ===

Deno.test("orElse() returns original Some", () => {
  const option = some(5);
  const result = orElse(option, some(10));
  assert.assertEquals(isSome(result), true);
  if (isSome(result)) {
    assert.assertEquals(result.value, 5);
  }
});

Deno.test("orElse() returns alternative for None", () => {
  const option = none;
  const result = orElse(option, some(10));
  assert.assertEquals(isSome(result), true);
  if (isSome(result)) {
    assert.assertEquals(result.value, 10);
  }
});

Deno.test("orElse() calls alternative function for None", () => {
  const option = none;
  const result = orElse(option, () => some(42));
  assert.assertEquals(isSome(result), true);
  if (isSome(result)) {
    assert.assertEquals(result.value, 42);
  }
});

// === tap() Tests ===

Deno.test("tap() calls function for Some and returns same option", () => {
  const option = some(5);
  let sideEffect = 0;
  const tapped = tap(option, (v) => {
    sideEffect = v;
  });
  assert.assertEquals(sideEffect, 5);
  assert.assertEquals(tapped, option);
});

Deno.test("tap() does not call function for None", () => {
  const option = none;
  let called = false;
  const tapped = tap(option, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, option);
});

// === tapNone() Tests ===

Deno.test("tapNone() calls function for None and returns same option", () => {
  const option = none;
  let called = false;
  const tapped = tapNone(option, () => {
    called = true;
  });
  assert.assertEquals(called, true);
  assert.assertEquals(tapped, option);
});

Deno.test("tapNone() does not call function for Some", () => {
  const option = some(5);
  let called = false;
  const tapped = tapNone(option, () => {
    called = true;
  });
  assert.assertEquals(called, false);
  assert.assertEquals(tapped, option);
});

// === zip() Tests ===

Deno.test("zip() combines two Some options", () => {
  const optionA = some(1);
  const optionB = some("a");
  const zipped = zip(optionA, optionB);
  assert.assertEquals(isSome(zipped), true);
  if (isSome(zipped)) {
    assert.assertEquals(zipped.value, [1, "a"]);
  }
});

Deno.test("zip() returns None if first is None", () => {
  const optionA = none;
  const optionB = some("a");
  const zipped = zip(optionA, optionB);
  assert.assertEquals(isNone(zipped), true);
});

Deno.test("zip() returns None if second is None", () => {
  const optionA = some(1);
  const optionB = none;
  const zipped = zip(optionA, optionB);
  assert.assertEquals(isNone(zipped), true);
});

// === zipWith() Tests ===

Deno.test("zipWith() combines two Some options with function", () => {
  const optionA = some(1);
  const optionB = some(2);
  const zipped = zipWith(optionA, optionB, (a, b) => a + b);
  assert.assertEquals(isSome(zipped), true);
  if (isSome(zipped)) {
    assert.assertEquals(zipped.value, 3);
  }
});

Deno.test("zipWith() returns None if any option is None", () => {
  const optionA = some(1);
  const optionB = none;
  const zipped = zipWith(optionA, optionB, (a: number, b: number) => a + b);
  assert.assertEquals(isNone(zipped), true);
});

// === contains() Tests ===

Deno.test("contains() returns true when Some contains value", () => {
  const option = some(5);
  assert.assertEquals(contains(option, 5), true);
});

Deno.test("contains() returns false when Some does not contain value", () => {
  const option = some(5);
  assert.assertEquals(contains(option, 10), false);
});

Deno.test("contains() returns false for None", () => {
  const option = none;
  assert.assertEquals(contains(option, 5), false);
});

// === exists() Tests ===

Deno.test("exists() returns true when predicate matches Some", () => {
  const option = some(10);
  assert.assertEquals(exists(option, (x) => x > 5), true);
});

Deno.test("exists() returns false when predicate does not match Some", () => {
  const option = some(3);
  assert.assertEquals(exists(option, (x) => x > 5), false);
});

Deno.test("exists() returns false for None", () => {
  const option = none;
  assert.assertEquals(exists(option, (_x: number) => true), false);
});
