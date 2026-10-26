// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as takeFromObject from "./take-from-object.ts";

nodeTest.test("basic", () => {
  const obj1 = { a: 1, b: 2, c: 3 };
  const int1 = 2;

  const result = takeFromObject.takeFromObject(obj1, int1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 2);
  assert.assertEquals(result, { a: 1, b: 2 });
});
