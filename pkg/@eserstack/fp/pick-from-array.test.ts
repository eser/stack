// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as pickFromArray from "./pick-from-array.ts";

nodeTest.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const arr2 = [2, 3, 6];

  const result = pickFromArray.pickFromArray(arr1, arr2);

  assert.assertNotStrictEquals(result.items, arr1);
  assert.assertNotStrictEquals(result.items, arr2);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  assert.assertNotStrictEquals(result.rest, arr1);
  assert.assertNotStrictEquals(result.rest, arr2);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});

nodeTest.test("with-generator-1", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const arr1 = [2, 3, 6];

  const generated1 = gen1();
  const result = pickFromArray.pickFromArray(generated1, arr1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.items as any, generated1 as any);
  assert.assertNotStrictEquals(result.items, arr1);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.rest as any, generated1 as any);
  assert.assertNotStrictEquals(result.rest, arr1);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});

nodeTest.test("with-generator-2", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const gen1 = function* () {
    yield 2;
    yield 3;
    yield 6;
  };

  const generated1 = gen1();
  const result = pickFromArray.pickFromArray(arr1, generated1);

  assert.assertNotStrictEquals(result.items, arr1);
  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.items as any, generated1 as any);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  assert.assertNotStrictEquals(result.rest, arr1);
  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.rest as any, generated1 as any);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});
