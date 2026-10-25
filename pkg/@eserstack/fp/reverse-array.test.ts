// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as reverseArray from "./reverse-array.ts";

nodeTest.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];

  const result = reverseArray.reverseArray(arr1);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 5);
  assert.assertEquals(result, [5, 4, 3, 2, 1]);
});

nodeTest.test("with-generator", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const generated1 = gen1();
  const result = reverseArray.reverseArray(generated1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result as any, generated1 as any);
  assert.assertEquals(result.length, 5);
  assert.assertEquals(result, [5, 4, 3, 2, 1]);
});
