import { assert, bdd } from "./deps.ts";
import { removeIndexFromArray } from "../remove-index-from-array.ts";

bdd.describe("hex/lib/fp/remove-index-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const int1 = 2;
    const int2 = 3;

    const result = removeIndexFromArray(arr1, int1, int2);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result, [1, 2, 5]);
  });

  bdd.it("with-generator", () => {
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
    const result = removeIndexFromArray(generated1, int1, int2);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result, [1, 2, 5]);
  });
});
