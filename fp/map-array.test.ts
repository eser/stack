import { assert, bdd } from "../deps.ts";
import { mapArray } from "./map-array.ts";

bdd.describe("cool/fp/map-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const func1 = (x: number) => x - 1;

    const result = mapArray(arr1, func1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [0, 1, 2, 3, 4]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    };
    const func1 = (x: number) => x - 1;

    const generated1 = gen1();
    const result = mapArray(generated1, func1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 5);
    assert.assertEquals(result, [0, 1, 2, 3, 4]);
  });
});
