import { asserts, bdd } from "./deps.ts";
import { mergeObjects } from "../merge-objects.ts";

bdd.describe("hex/fp/merge-objects", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3 };

    const result = mergeObjects(obj1, obj2);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertNotStrictEquals(result, obj2);
    asserts.assertEquals(Object.keys(result).length, 3);
    asserts.assertEquals(result, { a: 1, b: 2, c: 3 });
  });
});
