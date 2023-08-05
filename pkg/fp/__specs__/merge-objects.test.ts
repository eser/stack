import { assert, bdd } from "./deps.ts";
import { mergeObjects } from "../merge-objects.ts";

bdd.describe("hexfp/merge-objects", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3 };

    const result = mergeObjects(obj1, obj2);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertNotStrictEquals(result, obj2);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, { a: 1, b: 2, c: 3 });
  });
});
