import { asserts } from "./deps.ts";
import curryFunctions from "../curry-functions.ts";

Deno.test("hex/fp/curry-functions:basic", () => {
  const func1 = (x: number) => x + 1;
  const func2 = (x: number) => x * 2;
  const obj1 = { func1, func2 };
  const int1 = 5;

  const result = curryFunctions(obj1, int1);

  asserts.assertNotStrictEquals(result, obj1);
  asserts.assertEquals(Object.keys(result).length, 2);
  asserts.assertEquals(result.func1(), 6);
  asserts.assertEquals(result.func2(), 10);
});
