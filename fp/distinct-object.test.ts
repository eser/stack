import * as assert from "$cool/hex/stdx/assert.ts";
import * as bdd from "$cool/hex/stdx/testing/bdd.ts";
import { distinctObject } from "./distinct-object.ts";

bdd.describe("cool/fp/distinct-object", () => {
  bdd.it("basic", () => {
    const obj1 = {
      a: { id: 1, name: "foo", parent: 0 },
      b: { id: 2, name: "bar", parent: 1 },
      c: { id: 3, name: "baz", parent: 1 },
    };
    const func1 = (item: { parent: number }) => item.parent;

    const result = distinctObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, {
      a: { id: 1, name: "foo", parent: 0 },
      b: { id: 2, name: "bar", parent: 1 },
    });
  });
});
