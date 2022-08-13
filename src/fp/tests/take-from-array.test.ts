import { asserts } from "./deps.ts";
import { takeFromArray } from "../take-from-array.ts";

Deno.test("hex/fp/take-from-array:basic", () => {
  const arr1 = ["a", "b", "c"];
  const int1 = 2;

  const result = takeFromArray(arr1, int1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 2);
  asserts.assertEquals(result, ["a", "b"]);
});

Deno.test("hex/fp/take-from-array:with-generator", () => {
  const gen1 = function* gen() {
    yield "a";
    yield "b";
    yield "c";
  };
  const int1 = 2;

  const result = takeFromArray(gen1(), int1);

  asserts.assertNotStrictEquals(result, gen1());
  asserts.assertEquals(result.length, 2);
  asserts.assertEquals(result, ["a", "b"]);
});
