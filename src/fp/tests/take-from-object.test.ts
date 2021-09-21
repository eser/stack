import { asserts } from "./deps.ts";
import takeFromObject from "../take-from-object.ts";

Deno.test("hex/fp/take-from-object:basic", () => {
  const obj1 = { a: 1, b: 2, c: 3 };
  const int1 = 2;

  const result = takeFromObject(obj1, int1);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(Object.keys(result).length, 2);
  asserts.assertEquals(result, { a: 1, b: 2 });
});
