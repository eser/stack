// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { wthout } from "./wthout.ts";

bdd.describe("cool/fp/wthout", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const arr1 = ["a", "d"];

    const result = wthout(obj1, ...arr1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, { b: 2, c: 3, e: 5 });
  });
});
