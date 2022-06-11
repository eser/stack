import { asserts } from "./deps.ts";
import removeFirstMatchFromArray from "../remove-first-match-from-array.ts";

Deno.test("hex/fp/remove-first-match-from-array:basic", () => {
  const arr1 = [1, 5, 2, 3, 4, 5];
  const func1 = (x: number) => x === 5;

  const result = removeFirstMatchFromArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [1, 2, 3, 4, 5]);
});

Deno.test("hex/fp/remove-first-match-from-array:with-generator", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 5;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };
  const func1 = (x: number) => x === 5;

  const result = removeFirstMatchFromArray(gen1(), func1);

  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [1, 2, 3, 4, 5]);
});
