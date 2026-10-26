// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as chunk from "./chunk.ts";

nodeTest.test("basic", () => {
  const arr = [1, 2, 3, 4, 5];

  const result = chunk.chunk(arr, 2);

  assert.assertEquals(result, [[1, 2], [3, 4], [5]]);
});

nodeTest.test("empty-array", () => {
  const result = chunk.chunk([], 2);

  assert.assertEquals(result, []);
});

nodeTest.test("size-greater-than-length", () => {
  const arr = [1, 2, 3];

  const result = chunk.chunk(arr, 5);

  assert.assertEquals(result, [[1, 2, 3]]);
});

nodeTest.test("size-equals-one", () => {
  const arr = [1, 2, 3];

  const result = chunk.chunk(arr, 1);

  assert.assertEquals(result, [[1], [2], [3]]);
});

nodeTest.test("size-equals-length", () => {
  const arr = [1, 2, 3, 4];

  const result = chunk.chunk(arr, 4);

  assert.assertEquals(result, [[1, 2, 3, 4]]);
});

nodeTest.test("invalid-size", () => {
  const arr = [1, 2, 3];

  assert.assertEquals(chunk.chunk(arr, 0), []);
  assert.assertEquals(chunk.chunk(arr, -1), []);
});

nodeTest.test("immutability", () => {
  const arr = [1, 2, 3, 4];

  const result = chunk.chunk(arr, 2);

  assert.assertNotStrictEquals(result[0], arr);
  assert.assertEquals(arr, [1, 2, 3, 4]);
});
