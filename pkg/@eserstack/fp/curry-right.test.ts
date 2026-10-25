// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as curryRight from "./curry-right.ts";

Deno.test("basic", () => {
  const dec = (a: number, b: number) => a - b;

  const decWith5 = curryRight.curryRight(dec, 5);

  const result = decWith5(3);

  assert.assertEquals(result, -2);
});
