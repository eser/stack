import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { prependToObject } from "./prepend-to-object.ts";

bdd.describe("cool/fp/prepend-to-object", () => {
  bdd.it("basic", () => {
    const obj1 = { b: 2, c: 3 };
    const obj2 = { a: 1 };

    const result = prependToObject(obj1, obj2);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertNotStrictEquals(result, obj2);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, { a: 1, b: 2, c: 3 });
  });
});
