// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "./deps-dev.ts";
import { dropFromArray } from "./drop-from-array.ts";

bdd.describe("cool/fp/drop-from-array", () => {
  bdd.it("basic", () => {
    const arr1 = ["a", "b", "c"];
    const int1 = 1;

    const result = dropFromArray(arr1, int1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result, ["b", "c"]);
  });

  bdd.it("with-generator", () => {
    const gen1 = function* () {
      yield "a";
      yield "b";
      yield "c";
    };
    const int1 = 1;

    const generated1 = gen1();
    const result = dropFromArray(generated1, int1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> generated1);
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result, ["b", "c"]);
  });
});
