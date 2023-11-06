// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "../deps.ts";
import { reverseObject } from "./reverse-object.ts";

bdd.describe("cool/fp/reverse-object", () => {
  bdd.it("basic", () => {
    const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };

    const result = reverseObject(obj1);

    assert.assertNotStrictEquals(result, obj1);
    assert.assertEquals(Object.keys(result).length, 5);
    assert.assertEquals(result, { e: 5, d: 4, c: 3, b: 2, a: 1 });
  });
});
