import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { reverseArray } from "./reverse-array.ts";

bdd.describe("cool/fp/reverse-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];

    const result = reverseArray(arr1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [5, 4, 3, 2, 1]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    };

    const generated1 = gen1();
    const result = reverseArray(generated1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [5, 4, 3, 2, 1]);
  });
});
