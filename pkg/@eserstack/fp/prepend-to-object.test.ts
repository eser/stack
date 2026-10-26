// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as prependToObject from "./prepend-to-object.ts";

nodeTest.test("basic", () => {
  const obj1 = { b: 2, c: 3 };
  const obj2 = { a: 1 };

  const result = prependToObject.prependToObject(obj1, obj2);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertNotStrictEquals(result, obj2);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(result, { a: 1, b: 2, c: 3 });
});
