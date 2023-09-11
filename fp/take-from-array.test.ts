import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { takeFromArray } from "./take-from-array.ts";

bdd.describe("cool/fp/take-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = ["a", "b", "c"];
    const int1 = 2;

    const result = takeFromArray(arr1, int1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result, ["a", "b"]);
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
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result, ["a", "b"]);
  });
});
