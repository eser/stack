import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { deepCopy } from "./deep-copy.ts";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

bdd.describe("cool/fp/deep-copy", () => {
  bdd.it("basic", () => {
    const obj1 = { value: 5 };

    const result = deepCopy(obj1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertStrictEquals(result.constructor, Object);
    assert.assertEquals(result, obj1);
    assert.assertEquals(result, { value: 5 });
  });

  bdd.it("classes", () => {
    const obj1 = new Dummy({ value: 5 });

    const result = deepCopy(obj1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertStrictEquals(result.constructor, Dummy);
    assert.assertEquals(result, obj1);
    assert.assertEquals(result, new Dummy({ value: 5 }));
  });
});
