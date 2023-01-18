import { assert, bdd } from "./deps.ts";
import { mergeArrays } from "../merge-arrays.ts";

bdd.describe("hex/lib/fp/merge-arrays", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5];

    const result = mergeArrays(arr1, arr2);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertNotStrictEquals(result, arr2);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [1, 2, 3, 4, 5]);
  });

  bdd.it("with-generator-1", () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
    };
    const arr1 = [4, 5];

    const generated1 = gen1();
    const result = mergeArrays(generated1, arr1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [1, 2, 3, 4, 5]);
  });

  bdd.it("with-generator-2", () => {
    const arr1 = [1, 2, 3];
    const gen1 = function* () {
      yield 4;
      yield 5;
    };

    const generated1 = gen1();
    const result = mergeArrays(arr1, generated1);

    assert.assertNotStrictEquals(result, arr1);
    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [1, 2, 3, 4, 5]);
  });
});
