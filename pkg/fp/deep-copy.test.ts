// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { deepCopy } from "./deep-copy.ts";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

Deno.test("basic", () => {
  const obj1 = { value: 5 };

  const result = deepCopy(obj1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertStrictEquals(result.constructor, Object);
  assert.assertEquals(result, obj1);
  assert.assertEquals(result, { value: 5 });
});

Deno.test("classes", () => {
  const obj1 = new Dummy({ value: 5 });

  const result = deepCopy(obj1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertStrictEquals(result.constructor, Dummy);
  assert.assertEquals(result, obj1);
  assert.assertEquals(result, new Dummy({ value: 5 }));
});
