import { assert, bdd } from "./deps.ts";
import { associateObject } from "../associate-object.ts";

bdd.describe("hex/lib/fp/associate-object", () => {
  bdd.it("basic", () => {
    const obj1 = {
      a: { id: 1, name: "foo" },
      b: { id: 2, name: "bar" },
      c: { id: 3, name: "baz" },
    };
    const func1 = (value: { id: number }) => value.id;

    const result = associateObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, {
      1: { id: 1, name: "foo" },
      2: { id: 2, name: "bar" },
      3: { id: 3, name: "baz" },
    });
  });

  bdd.it("with-value-skipping", () => {
    const obj1 = {
      a: { id: 1, name: "foo", skip: false },
      b: { id: 2, name: "bar", skip: false },
      c: { id: 3, name: "baz", skip: true },
    };
    const func1 = (value: { id: number; skip: boolean }) =>
      value.skip ? undefined : value.id;

    const result = associateObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, {
      1: { id: 1, name: "foo", skip: false },
      2: { id: 2, name: "bar", skip: false },
    });
  });
});
