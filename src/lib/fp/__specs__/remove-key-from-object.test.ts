import { assert, bdd } from "./deps.ts";
import { removeKeyFromObject } from "../remove-key-from-object.ts";

bdd.describe("hex/lib/fp/remove-key-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const str1 = "b";
    const str2 = "c";

    const result = removeKeyFromObject(obj1, str1, str2);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, { a: 1, d: 4, e: 5 });
  });
});
