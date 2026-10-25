// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as appendToArray from "./append-to-array.ts";

nodeTest.test("basic", () => {
  const arr1 = ["a", "b"];
  const str1 = "c";

  const result = appendToArray.appendToArray(arr1, str1);

  assert.assertNotStrictEquals(result, arr1);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, ["a", "b", "c"]);
});

nodeTest.test("with-generator", () => {
  const gen1 = function* () {
    yield "a";
    yield "b";
  };
  const str1 = "c";

  const generated1 = gen1();
  const result = appendToArray.appendToArray(generated1, str1);

  // oxlint-disable-next-line typescript/no-explicit-any
  assert.assertNotStrictEquals(result as any, generated1 as any);
  assert.assertEquals(result.length, 3);
  assert.assertEquals(result, ["a", "b", "c"]);
});
