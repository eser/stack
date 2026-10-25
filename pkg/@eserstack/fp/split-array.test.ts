// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as splitArray from "./split-array.ts";

Deno.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const int1 = 3;

  const result = splitArray.splitArray(arr1, int1);

  assert.assertNotStrictEquals(result.items, arr1);
  assert.assertEquals(result.items.length, 3);
  assert.assertEquals(result.items, [1, 2, 3]);

  assert.assertNotStrictEquals(result.rest, arr1);
  assert.assertEquals(result.rest.length, 2);
  assert.assertEquals(result.rest, [4, 5]);
});

Deno.test("with-generator", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const int1 = 3;

  const generated1 = gen1();
  const result = splitArray.splitArray(generated1, int1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.items as any, generated1 as any);
  assert.assertEquals(result.items.length, 3);
  assert.assertEquals(result.items, [1, 2, 3]);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result.rest as any, generated1 as any);
  assert.assertEquals(result.rest.length, 2);
  assert.assertEquals(result.rest, [4, 5]);
});
