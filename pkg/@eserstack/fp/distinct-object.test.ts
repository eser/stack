// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as distinctObject from "./distinct-object.ts";

nodeTest.test("basic", () => {
  const obj1 = {
    a: { id: 1, name: "foo", parent: 0 },
    b: { id: 2, name: "bar", parent: 1 },
    c: { id: 3, name: "baz", parent: 1 },
  };
  const func1 = (item: { id: number; name: string; parent: number }) =>
    item.parent;

  const result = distinctObject.distinctObject(obj1, func1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 2);
  assert.assertEquals(result, {
    a: { id: 1, name: "foo", parent: 0 },
    b: { id: 2, name: "bar", parent: 1 },
  });
});
