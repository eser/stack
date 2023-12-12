// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { decorate } from "./decorate.ts";

bdd.describe("cool/fp/decorate", () => {
  bdd.it("basic", () => {
    let generator = () => 5;

    generator = decorate(generator, (x) => x() * 2);
    generator = decorate(generator, (x) => x() + 1);

    const result = generator();

    assert.assertEquals(result, 11);
  });

  bdd.it("parameters", () => {
    let generator = (a: number) => a + 5;

    generator = decorate(generator, (x, a) => x(a) * 2);
    generator = decorate(generator, (x, a) => x(a) + 1);

    const result = generator(3);

    assert.assertEquals(result, 17);
  });
});
