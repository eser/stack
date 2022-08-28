import { asserts } from "./deps.ts";
import { dropFromArray } from "../drop-from-array.ts";

Deno.test("hex/fp/drop-from-array:basic", () => {
  const arr1 = ["a", "b", "c"];
  const int1 = 1;

  const result = dropFromArray(arr1, int1);

  asserts.assertNotStrictEquals(result, arr1);
  asserts.assertEquals(result.length, 2);
  asserts.assertEquals(result, ["b", "c"]);
});

Deno.test("hex/fp/drop-from-array:with-generator", () => {
  const gen1 = function* gen() {
    yield "a";
    yield "b";
    yield "c";
  };
  const int1 = 1;

  const generated1 = gen1();
  const result = dropFromArray(generated1, int1);

  // deno-lint-ignore no-explicit-any
  asserts.assertNotStrictEquals(<any> result, <any> generated1);
  asserts.assertEquals(result.length, 2);
  asserts.assertEquals(result, ["b", "c"]);
});
