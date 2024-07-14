// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { appendToObject } from "./append-to-object.ts";

Deno.test("basic", () => {
  const obj1 = { a: 1, b: 2 };
  const obj2 = { c: 3 };

  const result = appendToObject(obj1, obj2);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertNotStrictEquals(result, obj2);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(result, { a: 1, b: 2, c: 3 });
});
