import { asserts } from "./deps.ts";
import { filterObject } from "../filter-object.ts";

Deno.test("hex/fp/filter-object:basic", () => {
  const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const func1 = (x: number) => x <= 3;

  const result = filterObject(obj1, func1);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(Object.keys(result).length, 3);
  asserts.assertEquals(result, { a: 1, b: 2, c: 3 });
});
