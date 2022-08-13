import { asserts } from "./deps.ts";
import { pickFromObject } from "../pick-from-object.ts";

Deno.test("hex/fp/pick-from-object:basic", () => {
  const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const arr1 = ["b", "c", "f"];

  const result = pickFromObject(obj1, arr1);

  asserts.assertNotStrictEquals(result.items, obj1);
  asserts.assertEquals(Object.keys(result.items).length, 2);
  asserts.assertEquals(result.items, { b: 2, c: 3 });

  asserts.assertNotStrictEquals(result.rest, obj1);
  asserts.assertEquals(Object.keys(result.rest).length, 3);
  asserts.assertEquals(result.rest, { a: 1, d: 4, e: 5 });
});
