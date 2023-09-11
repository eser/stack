import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { curry } from "./curry.ts";

bdd.describe("cool/fp/curry", () => {
  bdd.it("basic", () => {
    const sum = (a: number, b: number) => a + b;

    const sumWith5 = curry(sum, 5);

    const result = sumWith5(3);

    assert.assertEquals(result, 8);
  });
});
