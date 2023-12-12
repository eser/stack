// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { filterObject } from "./filter-object.ts";

bdd.describe("cool/fp/filter-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const func1 = (x: number) => x <= 3;

    const result = filterObject(obj1, func1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, { a: 1, b: 2, c: 3 });
  });
});
