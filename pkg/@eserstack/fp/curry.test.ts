// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { curry } from "./curry.ts";

Deno.test("basic", () => {
  const sum = (a: number, b: number) => a + b;

  const sumWith5 = curry(sum, 5);

  const result = sumWith5(3);

  assert.assertEquals(result, 8);
});
