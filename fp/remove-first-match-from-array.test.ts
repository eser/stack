// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { removeFirstMatchFromArray } from "./remove-first-match-from-array.ts";

bdd.describe("cool/fp/remove-first-match-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 5, 2, 3, 4, 5];
    const func1 = (x: number) => x === 5;

    const result = removeFirstMatchFromArray(arr1, func1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [1, 2, 3, 4, 5]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield 1;
      yield 5;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    };
    const func1 = (x: number) => x === 5;

    const generated1 = gen1();
    const result = removeFirstMatchFromArray(generated1, func1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [1, 2, 3, 4, 5]);
  });
});
