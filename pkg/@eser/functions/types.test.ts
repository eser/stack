// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { isNonEmpty, unwrapLazy } from "./types.ts";

// === unwrapLazy() Tests ===

Deno.test("unwrapLazy() returns value directly for non-function", () => {
  const result = unwrapLazy("hello");
  assert.assertEquals(result, "hello");
});

Deno.test("unwrapLazy() returns value directly for number", () => {
  const result = unwrapLazy(42);
  assert.assertEquals(result, 42);
});

Deno.test("unwrapLazy() returns value directly for object", () => {
  const obj = { key: "value" };
  const result = unwrapLazy(obj);
  assert.assertEquals(result, obj);
});

Deno.test("unwrapLazy() calls function and returns result", () => {
  const result = unwrapLazy(() => "lazy value");
  assert.assertEquals(result, "lazy value");
});

Deno.test("unwrapLazy() evaluates function lazily", () => {
  let evaluated = false;
  const lazyFn = () => {
    evaluated = true;
    return "result";
  };

  assert.assertEquals(evaluated, false);
  const result = unwrapLazy(lazyFn);
  assert.assertEquals(evaluated, true);
  assert.assertEquals(result, "result");
});

// === isNonEmpty() Tests ===

Deno.test("isNonEmpty() returns true for non-empty array", () => {
  const arr = [1, 2, 3];
  assert.assertEquals(isNonEmpty(arr), true);
});

Deno.test("isNonEmpty() returns true for single element array", () => {
  const arr = [1];
  assert.assertEquals(isNonEmpty(arr), true);
});

Deno.test("isNonEmpty() returns false for empty array", () => {
  const arr: number[] = [];
  assert.assertEquals(isNonEmpty(arr), false);
});

Deno.test("isNonEmpty() works as type guard", () => {
  const arr = [1, 2, 3] as readonly number[];

  if (isNonEmpty(arr)) {
    // TypeScript should know arr is NonEmptyArray<number> here
    const first: number = arr[0];
    assert.assertEquals(first, 1);
  }
});

Deno.test("isNonEmpty() returns false for readonly empty array", () => {
  const arr: readonly number[] = [];
  assert.assertEquals(isNonEmpty(arr), false);
});
