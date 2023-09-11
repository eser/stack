import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { curryFunctions } from "./curry-functions.ts";

bdd.describe("cool/fp/curry-functions", () => {
  bdd.it("basic", () => {
    const func1 = (x: number) => x + 1;
    const func2 = (x: number) => x * 2;
    const obj1 = { func1, func2 };
    const int1 = 5;

    const result = curryFunctions(obj1, int1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result.func1(), 6);
    assert.assertEquals(result.func2(), 10);
  });
});
