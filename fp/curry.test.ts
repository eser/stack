// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { curry } from "./curry.ts";

bdd.describe("cool/fp/curry", () => {
  bdd.it("basic", () => {
    const sum = (a: number, b: number) => a + b;

    const sumWith5 = curry(sum, 5);

    const result = sumWith5(3);

    assert.assertEquals(result, 8);
  });
});
