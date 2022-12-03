import { asserts, bdd } from "./deps.ts";
import { distinctObject } from "../distinct-object.ts";

bdd.describe("hex/lib/fp/distinct-object", () => {
  bdd.it("basic", () => {
    const obj1 = {
      a: { id: 1, name: "foo", parent: 0 },
      b: { id: 2, name: "bar", parent: 1 },
      c: { id: 3, name: "baz", parent: 1 },
    };
    const func1 = (item: { parent: number }) => item.parent;

    const result = distinctObject(obj1, func1);

    asserts.assertNotStrictEquals(result, obj1);
    asserts.assertEquals(Object.keys(result).length, 2);
    asserts.assertEquals(result, {
      a: { id: 1, name: "foo", parent: 0 },
      b: { id: 2, name: "bar", parent: 1 },
    });
  });
});
