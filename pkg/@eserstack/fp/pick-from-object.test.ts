// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { pickFromObject } from "./pick-from-object.ts";

Deno.test("basic", () => {
  const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const arr1 = ["b", "c", "f"];

  const result = pickFromObject(obj1, arr1);

  assert.assertNotStrictEquals(result.items, obj1);
  assert.assertEquals(Object.keys(result.items).length, 2);
  assert.assertEquals(result.items, { b: 2, c: 3 });

  assert.assertNotStrictEquals(result.rest, obj1);
  assert.assertEquals(Object.keys(result.rest).length, 3);
  assert.assertEquals(result.rest, { a: 1, d: 4, e: 5 });
});
