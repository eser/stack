import { asserts, bdd } from "./deps.ts";
import { removeValueFromObject } from "../remove-value-from-object.ts";

bdd.describe("hex/lib/fp/remove-value-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: "Ia", b: "IIb", c: "IIIc", d: "IVd", e: "Ve" };
    const str1 = "IIb";
    const str2 = "IIIc";

    const result = removeValueFromObject(obj1, str1, str2);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 3);
    asserts.assertEquals(result, { a: "Ia", d: "IVd", e: "Ve" });
  });
});
