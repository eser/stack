// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { prependToArray } from "./prepend-to-array.ts";

Deno.test("basic", () => {
  const arr1 = ["b", "c"];
  const str1 = "a";

  const result = prependToArray(arr1, str1);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, ["a", "b", "c"]);
});

Deno.test("with-generator", () => {
  const gen1 = function* () {
    yield "b";
    yield "c";
  };
  const str1 = "a";

  const generated1 = gen1();
  const result = prependToArray(generated1, str1);

  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result, <any> generated1);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, ["a", "b", "c"]);
});
