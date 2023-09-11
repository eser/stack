import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { takeFromObject } from "./take-from-object.ts";

bdd.describe("cool/fp/take-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const int1 = 2;

    const result = takeFromObject(obj1, int1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, { a: 1, b: 2 });
  });
});
