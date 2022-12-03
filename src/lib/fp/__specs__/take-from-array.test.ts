import { asserts, bdd } from "./deps.ts";
import { takeFromArray } from "../take-from-array.ts";

bdd.describe("hex/lib/fp/take-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = ["a", "b", "c"];
    const int1 = 2;

    const result = takeFromArray(arr1, int1);

    asserts.assertNotStrictEquals(result, arr1);
    asserts.assertEquals(result.length, 2);
    asserts.assertEquals(result, ["a", "b"]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield "a";
      yield "b";
      yield "c";
    };
    const int1 = 2;

    const generated1 = gen1();
    const result = takeFromArray(generated1, int1);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result, <any> generated1);
    asserts.assertEquals(result.length, 2);
    asserts.assertEquals(result, ["a", "b"]);
  });
});
