// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { removeFirstMatchFromObject } from "./remove-first-match-from-object.ts";

Deno.test("basic", () => {
  const obj1 = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
  const func1 = (x: number) => x === 5;

  const result = removeFirstMatchFromObject(obj1, func1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 5);
  assert.assertEquals(result, { a: 1, b: 2, c: 3, d: 4, e: 5 });
});
