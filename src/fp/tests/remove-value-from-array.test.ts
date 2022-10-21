import { asserts, bdd } from "./deps.ts";
import { removeValueFromArray } from "../remove-value-from-array.ts";

bdd.describe("hex/fp/remove-value-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const int1 = 2;
    const int2 = 3;

    const result = removeValueFromArray(arr1, int1, int2);

    asserts.assertNotStrictEquals(result, arr1);
    asserts.assertEquals(result.length, 3);
    asserts.assertEquals(result, [1, 4, 5]);
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
    const result = removeValueFromArray(generated1, int1, int2);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result, <any> generated1);
    asserts.assertEquals(result.length, 3);
    asserts.assertEquals(result, [1, 4, 5]);
  });
});
