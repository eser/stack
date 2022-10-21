import { asserts, bdd } from "./deps.ts";
import { removeKeyFromObject } from "../remove-key-from-object.ts";

bdd.describe("hex/fp/remove-key-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const str1 = "b";
    const str2 = "c";

    const result = removeKeyFromObject(obj1, str1, str2);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 3);
    asserts.assertEquals(result, { a: 1, d: 4, e: 5 });
  });
});
