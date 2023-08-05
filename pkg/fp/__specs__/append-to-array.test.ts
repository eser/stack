import { assert, bdd } from "./deps.ts";
import { appendToArray } from "../append-to-array.ts";

bdd.describe("hex/fp/append-to-array", () => {
  bdd.it("basic", () => {
    const arr1 = ["a", "b"];
    const str1 = "c";

    const result = appendToArray(arr1, str1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result, ["a", "b", "c"]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield "a";
      yield "b";
    };
    const str1 = "c";

    const generated1 = gen1();
    const result = appendToArray(generated1, str1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result, ["a", "b", "c"]);
  });
});
