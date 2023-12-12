// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { wth } from "./wth.ts";

bdd.describe("cool/fp/wth", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const obj2 = { b: 6, f: 8 };

    const result = wth(obj1, obj2);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 6);
    assert.assertEquals(result, { a: 1, b: 6, c: 3, d: 4, e: 5, f: 8 });
  });
});
