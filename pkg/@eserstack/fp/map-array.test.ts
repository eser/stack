// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mapArray from "./map-array.ts";

nodeTest.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const func1 = (x: number) => x - 1;

  const result = mapArray.mapArray(arr1, func1);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 5);
  assert.assertEquals(result, [0, 1, 2, 3, 4]);
});

nodeTest.test("with-generator", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };
  const func1 = (x: number) => x - 1;

  const generated1 = gen1();
  const result = mapArray.mapArray(generated1, func1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result as any, generated1 as any);
  assert.assertEquals(result.length, 5);
  assert.assertEquals(result, [0, 1, 2, 3, 4]);
});
