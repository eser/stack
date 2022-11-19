import { asserts, bdd } from "./deps.ts";
import { wthout } from "../wthout.ts";

bdd.describe("hex/fp/wthout", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const arr1 = ["a", "d"];

    const result = wthout(obj1, arr1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 3);
    asserts.assertEquals(result, { b: 2, c: 3, e: 5 });
  });
});
