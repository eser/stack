// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as decorate from "./decorate.ts";

nodeTest.test("basic", () => {
  let generator = () => 5;

  generator = decorate.decorate(generator, (x) => x() * 2);
  generator = decorate.decorate(generator, (x) => x() + 1);

  const result = generator();

  assert.assertEquals(result, 11);
});

nodeTest.test("parameters", () => {
  let generator = (a: number) => a + 5;

  generator = decorate.decorate(generator, (x, a) => x(a) * 2);
  generator = decorate.decorate(generator, (x, a) => x(a) + 1);

  const result = generator(3);

  assert.assertEquals(result, 17);
});
