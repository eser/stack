import { asserts } from "./deps.ts";
import { appendToArray } from "../append-to-array.ts";

Deno.test("hex/fp/append-to-array:basic", () => {
  const arr1 = ["a", "b"];
  const str1 = "c";

  const result = appendToArray(arr1, str1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, ["a", "b", "c"]);
});

Deno.test("hex/fp/append-to-array:with-generator", () => {
  const gen1 = function* gen() {
    yield "a";
    yield "b";
  };
  const str1 = "c";

  const generated1 = gen1();
  const result = appendToArray(generated1, str1);

  // deno-lint-ignore no-explicit-any
  asserts.assertNotStrictEquals(<any> result, <any> generated1);
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, ["a", "b", "c"]);
});
