// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as takeFromArray from "./take-from-array.ts";

Deno.test("basic", () => {
  const arr1 = ["a", "b", "c"];
  const int1 = 2;

  const result = takeFromArray.takeFromArray(arr1, int1);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 2);
  assert.assertEquals(result, ["a", "b"]);
});

Deno.test("with-generator", () => {
  const gen1 = function* () {
    yield "a";
    yield "b";
    yield "c";
  };
  const int1 = 2;

  const generated1 = gen1();
  const result = takeFromArray.takeFromArray(generated1, int1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result as any, generated1 as any);
  assert.assertEquals(result.length, 2);
  assert.assertEquals(result, ["a", "b"]);
});
