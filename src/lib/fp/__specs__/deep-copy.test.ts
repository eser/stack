import { asserts, bdd } from "./deps.ts";
import { deepCopy } from "../deep-copy.ts";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

bdd.describe("hex/lib/fp/deep-copy", () => {
  bdd.it("basic", () => {
    const obj1 = { value: 5 };

    const result = deepCopy(obj1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertStrictEquals(result.constructor, Object);
    asserts.assertEquals(result, obj1);
    asserts.assertEquals(result, { value: 5 });
  });

  bdd.it("classes", () => {
    const obj1 = new Dummy({ value: 5 });

    const result = deepCopy(obj1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertStrictEquals(result.constructor, Dummy);
    asserts.assertEquals(result, obj1);
    asserts.assertEquals(result, new Dummy({ value: 5 }));
  });
});
