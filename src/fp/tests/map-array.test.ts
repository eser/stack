import { asserts } from "./deps.ts";
import { mapArray } from "../map-array.ts";

Deno.test("hex/fp/map-array:basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const func1 = (x: number) => x - 1;

  const result = mapArray(arr1, func1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [0, 1, 2, 3, 4]);
});

Deno.test("hex/fp/map-array:with-generator", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };
  const func1 = (x: number) => x - 1;

  const result = mapArray(gen1(), func1);

  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [0, 1, 2, 3, 4]);
});
