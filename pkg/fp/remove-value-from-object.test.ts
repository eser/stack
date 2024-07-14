// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { removeValueFromObject } from "./remove-value-from-object.ts";

Deno.test("basic", () => {
  const obj1 = { a: "Ia", b: "IIb", c: "IIIc", d: "IVd", e: "Ve" };
  const str1 = "IIb";
  const str2 = "IIIc";

  const result = removeValueFromObject(obj1, str1, str2);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(result, { a: "Ia", d: "IVd", e: "Ve" });
});
