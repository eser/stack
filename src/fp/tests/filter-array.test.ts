import { asserts } from "./deps.ts";
import { filterArray } from "../filter-array.ts";

Deno.test("hex/fp/filter-array:basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const func1 = (x: number) => x <= 3;

  const result = filterArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, [1, 2, 3]);
});

Deno.test("hex/fp/filter-array:with-generator", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };
  const func1 = (x: number) => x <= 3;

  const result = filterArray(gen1(), func1);

  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, [1, 2, 3]);
});
