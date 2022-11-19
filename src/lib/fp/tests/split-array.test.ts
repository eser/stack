import { asserts, bdd } from "./deps.ts";
import { splitArray } from "../split-array.ts";

bdd.describe("hex/fp/split-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const int1 = 3;

    const result = splitArray(arr1, int1);

    asserts.assertNotStrictEquals(result.items, arr1);
    asserts.assertEquals(result.items.length, 3);
    asserts.assertEquals(result.items, [1, 2, 3]);

    asserts.assertNotStrictEquals(result.rest, arr1);
    asserts.assertEquals(result.rest.length, 2);
    asserts.assertEquals(result.rest, [4, 5]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    };

    const int1 = 3;

    const generated1 = gen1();
    const result = splitArray(generated1, int1);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.items, <any> generated1);
    asserts.assertEquals(result.items.length, 3);
    asserts.assertEquals(result.items, [1, 2, 3]);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.rest, <any> generated1);
    asserts.assertEquals(result.rest.length, 2);
    asserts.assertEquals(result.rest, [4, 5]);
  });
});
