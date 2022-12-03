import { asserts, bdd } from "./deps.ts";
import { pickFromArray } from "../pick-from-array.ts";

bdd.describe("hex/lib/fp/pick-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [2, 3, 6];

    const result = pickFromArray(arr1, arr2);

    asserts.assertNotStrictEquals(result.items, arr1);
    asserts.assertNotStrictEquals(result.items, arr2);
    asserts.assertEquals(result.items.length, 2);
    asserts.assertEquals(result.items, [2, 3]);

    asserts.assertNotStrictEquals(result.rest, arr1);
    asserts.assertNotStrictEquals(result.rest, arr2);
    asserts.assertEquals(result.rest.length, 3);
    asserts.assertEquals(result.rest, [1, 4, 5]);
  });

  bdd.it("with-generator-1", () => {
    const gen1 = function* () {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    };

    const arr1 = [2, 3, 6];

    const generated1 = gen1();
    const result = pickFromArray(generated1, arr1);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.items, <any> generated1);
    asserts.assertNotStrictEquals(result.items, arr1);
    asserts.assertEquals(result.items.length, 2);
    asserts.assertEquals(result.items, [2, 3]);

    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.rest, <any> generated1);
    asserts.assertNotStrictEquals(result.rest, arr1);
    asserts.assertEquals(result.rest.length, 3);
    asserts.assertEquals(result.rest, [1, 4, 5]);
  });

  bdd.it("with-generator-2", () => {
    const arr1 = [1, 2, 3, 4, 5];
    const gen1 = function* () {
      yield 2;
      yield 3;
      yield 6;
    };

    const generated1 = gen1();
    const result = pickFromArray(arr1, generated1);

    asserts.assertNotStrictEquals(result.items, arr1);
    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.items, <any> generated1);
    asserts.assertEquals(result.items.length, 2);
    asserts.assertEquals(result.items, [2, 3]);

    asserts.assertNotStrictEquals(result.rest, arr1);
    // deno-lint-ignore no-explicit-any
    asserts.assertNotStrictEquals(<any> result.rest, <any> generated1);
    asserts.assertEquals(result.rest.length, 3);
    asserts.assertEquals(result.rest, [1, 4, 5]);
  });
});
