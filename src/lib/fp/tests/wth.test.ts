import { asserts, bdd } from "./deps.ts";
import { wth } from "../wth.ts";

bdd.describe("hex/fp/wth", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const obj2 = { b: 6, f: 8 };

    const result = wth(obj1, obj2);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 6);
    asserts.assertEquals(result, { a: 1, b: 6, c: 3, d: 4, e: 5, f: 8 });
  });
});
