import { asserts, bdd } from "./deps.ts";
import { dropFromObject } from "../drop-from-object.ts";

bdd.describe("hex/fp/drop-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const int1 = 1;

    const result = dropFromObject(obj1, int1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 2);
    asserts.assertEquals(result, { b: 2, c: 3 });
  });
});
