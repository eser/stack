import { asserts } from "./deps.ts";
import { prependToArray } from "../prepend-to-array.ts";

Deno.test("hex/fp/prepend-to-array:basic", () => {
  const arr1 = ["b", "c"];
  const str1 = "a";

  const result = prependToArray(arr1, str1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, ["a", "b", "c"]);
});

Deno.test("hex/fp/prepend-to-array:with-generator", () => {
  const gen1 = function* gen() {
    yield "b";
    yield "c";
  };
  const str1 = "a";

  const generated1 = gen1();
  const result = prependToArray(generated1, str1);

  // deno-lint-ignore no-explicit-any
  asserts.assertNotStrictEquals(<any> result, <any> generated1);
  asserts.assertEquals(result.length, 3);
  asserts.assertEquals(result, ["a", "b", "c"]);
});
