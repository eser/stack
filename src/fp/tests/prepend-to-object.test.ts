import { asserts } from "./deps.ts";
import prependToObject from "../prepend-to-object.ts";

Deno.test("hex/fp/prepend-to-object:basic", () => {
  const obj1 = { b: 2, c: 3 };
  const obj2 = { a: 1 };

  const result = prependToObject(obj1, obj2);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertNotStrictEquals(result, obj2);
  asserts.assertEquals(Object.keys(result).length, 3);
  asserts.assertEquals(result, { a: 1, b: 2, c: 3 });
});
