import { asserts } from "./deps.ts";
import mergeArrays from "../merge-arrays.ts";

Deno.test("hex/fp/merge-arrays:basic", () => {
  const arr1 = [1, 2, 3];
  const arr2 = [4, 5];

  const result = mergeArrays(arr1, arr2);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertNotStrictEquals(result, arr2);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [1, 2, 3, 4, 5]);
});

Deno.test("hex/fp/merge-arrays:with-generator-1", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
  };
  const arr1 = [4, 5];

  const result = mergeArrays(gen1(), arr1);

  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [1, 2, 3, 4, 5]);
});

Deno.test("hex/fp/merge-arrays:with-generator-2", () => {
  const arr1 = [1, 2, 3];
  const gen1 = function* gen() {
    yield 4;
    yield 5;
  };

  const result = mergeArrays(arr1, gen1());

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [1, 2, 3, 4, 5]);
});
