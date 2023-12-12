// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { distinctArray } from "./distinct-array.ts";

bdd.describe("cool/fp/distinct-array", () => {
  bdd.it("basic", () => {
    const arr1 = [
      { id: 1, name: "foo", parent: 0 },
      { id: 2, name: "bar", parent: 1 },
      { id: 3, name: "baz", parent: 1 },
    ];
    const func1 = (item: { parent: number }) => item.parent;

    const result = distinctArray(arr1, func1);

    assert.assertNotStrictEquals(result, arr1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, [
      { id: 1, name: "foo", parent: 0 },
      { id: 2, name: "bar", parent: 1 },
    ]);
  });
});
