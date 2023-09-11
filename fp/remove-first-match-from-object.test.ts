import { assert, bdd } from "../deps.ts";
import { removeFirstMatchFromObject } from "./remove-first-match-from-object.ts";

bdd.describe("cool/fp/remove-first-match-from-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
    const func1 = (x: number) => x === 5;

    const result = removeFirstMatchFromObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 5);
    assert.assertEquals(result, { a: 1, b: 2, c: 3, d: 4, e: 5 });
  });
});
