import { assert, bdd } from "./deps.ts";
import { mapObject } from "../map-object.ts";

bdd.describe("hexfp/map-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const func1 = (value: number, key: string | number | symbol) => ({
      [key]: value - 1,
    });

    const result = mapObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 5);
    assert.assertEquals(result, { a: 0, b: 1, c: 2, d: 3, e: 4 });
  });

  bdd.it("with-value-skipping", () => {
    const obj1 = { a: 1, b: 2, c: null };
    const func1 = (
      value: number | null,
      key: string | number | symbol,
    ) => {
      if (value === null) {
        return null;
      }

      return { [key]: value - 1 };
    };

    const result = mapObject(obj1, func1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> obj1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, { a: 0, b: 1 });
  });
});
