import { asserts } from "./deps.ts";
import splitArray from "../split-array.ts";

Deno.test("hex/fp/split-array:basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const int1 = 3;

  const result = splitArray(arr1, int1);

  asserts.assertNotStrictEquals(result.items, arr1);
  asserts.assertEquals(result.items.length, 3);
  asserts.assertEquals(result.items, [1, 2, 3]);

  asserts.assertNotStrictEquals(result.rest, arr1);
  asserts.assertEquals(result.rest.length, 2);
  asserts.assertEquals(result.rest, [4, 5]);
});

Deno.test("hex/fp/split-array:with-generator-1", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const int1 = 3;

  const result = splitArray(gen1(), int1);

  asserts.assertNotStrictEquals(result.items, gen1());
  asserts.assertEquals(result.items.length, 3);
  asserts.assertEquals(result.items, [1, 2, 3]);

  asserts.assertNotStrictEquals(result.rest, gen1());
  asserts.assertEquals(result.rest.length, 2);
  asserts.assertEquals(result.rest, [4, 5]);
});
