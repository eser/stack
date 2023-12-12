// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "./deps-dev.ts";
import { curry } from "./curry.ts";

bdd.describe("cool/fp/curry", () => {
  bdd.it("basic", () => {
    const sum = (a: number, b: number) => a + b;

    const sumWith5 = curry(sum, 5);

    const result = sumWith5(3);

    assert.assertEquals(result, 8);
  });
});
