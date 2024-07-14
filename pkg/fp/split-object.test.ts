// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { splitObject } from "./split-object.ts";

Deno.test("basic", () => {
  const obj1 = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const int1 = 3;

  const result = splitObject(obj1, int1);

  assert.assertNotStrictEquals(result.items, obj1);
  assert.assertEquals(Object.keys(result.items).length, 3);
  assert.assertEquals(result.items, { a: 1, b: 2, c: 3 });

  assert.assertNotStrictEquals(result.rest, obj1);
  assert.assertEquals(Object.keys(result.rest).length, 2);
  assert.assertEquals(result.rest, { d: 4, e: 5 });
});
