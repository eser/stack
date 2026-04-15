// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { chunk } from "./chunk.ts";

Deno.test("basic", () => {
  const arr = [1, 2, 3, 4, 5];

  const result = chunk(arr, 2);

  assert.assertEquals(result, [[1, 2], [3, 4], [5]]);
});

Deno.test("empty-array", () => {
  const result = chunk([], 2);

  assert.assertEquals(result, []);
});

Deno.test("size-greater-than-length", () => {
  const arr = [1, 2, 3];

  const result = chunk(arr, 5);

  assert.assertEquals(result, [[1, 2, 3]]);
});

Deno.test("size-equals-one", () => {
  const arr = [1, 2, 3];

  const result = chunk(arr, 1);

  assert.assertEquals(result, [[1], [2], [3]]);
});

Deno.test("size-equals-length", () => {
  const arr = [1, 2, 3, 4];

  const result = chunk(arr, 4);

  assert.assertEquals(result, [[1, 2, 3, 4]]);
});

Deno.test("invalid-size", () => {
  const arr = [1, 2, 3];

  assert.assertEquals(chunk(arr, 0), []);
  assert.assertEquals(chunk(arr, -1), []);
});

Deno.test("immutability", () => {
  const arr = [1, 2, 3, 4];

  const result = chunk(arr, 2);

  assert.assertNotStrictEquals(result[0], arr);
  assert.assertEquals(arr, [1, 2, 3, 4]);
});
