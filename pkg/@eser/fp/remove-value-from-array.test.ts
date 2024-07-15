// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { removeValueFromArray } from "./remove-value-from-array.ts";

Deno.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const int1 = 2;
  const int2 = 3;

  const result = removeValueFromArray(arr1, int1, int2);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, [1, 4, 5]);
});

Deno.test("with-generator", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };
  const int1 = 2;
  const int2 = 3;

  const generated1 = gen1();
  const result = removeValueFromArray(generated1, int1, int2);

  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result, <any> generated1);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, [1, 4, 5]);
});
