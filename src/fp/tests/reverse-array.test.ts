import { asserts } from "./deps.ts";
import { reverseArray } from "../reverse-array.ts";

Deno.test("hex/fp/reverse-array:basic", () => {
  const arr1 = [1, 2, 3, 4, 5];

  const result = reverseArray(arr1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [5, 4, 3, 2, 1]);
});

Deno.test("hex/fp/reverse-array:with-generator", () => {
  const gen1 = function* gen() {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const generated1 = gen1();
  const result = reverseArray(generated1);

  // deno-lint-ignore no-explicit-any
  asserts.assertNotStrictEquals(<any> result, <any> generated1);
  asserts.assertEquals(result.length, 5);
  asserts.assertEquals(result, [5, 4, 3, 2, 1]);
});
