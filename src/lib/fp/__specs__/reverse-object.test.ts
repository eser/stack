import { asserts, bdd } from "./deps.ts";
import { reverseObject } from "../reverse-object.ts";

bdd.describe("hex/lib/fp/reverse-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };

    const result = reverseObject(obj1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 5);
    asserts.assertEquals(result, { e: 5, d: 4, c: 3, b: 2, a: 1 });
  });
});
