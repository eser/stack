// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { associateObject } from "./associate-object.ts";

Deno.test("basic", () => {
  const obj1 = {
    a: { id: 1, name: "foo" },
    b: { id: 2, name: "bar" },
    c: { id: 3, name: "baz" },
  };
  const func1 = (value: { id: number; name: string }) => value.id;

  const result = associateObject(obj1, func1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 3);
  assert.assertEquals(result, {
    1: { id: 1, name: "foo" },
    2: { id: 2, name: "bar" },
    3: { id: 3, name: "baz" },
  });
});

Deno.test("with-value-skipping", () => {
  const obj1 = {
    a: { id: 1, name: "foo", skip: false },
    b: { id: 2, name: "bar", skip: false },
    c: { id: 3, name: "baz", skip: true },
  };
  const func1 = (value: { id: number; name: string; skip: boolean }) =>
    value.skip ? undefined : value.id;

  const result = associateObject(obj1, func1);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertEquals(Object.keys(result).length, 2);
  assert.assertEquals(result, {
    1: { id: 1, name: "foo", skip: false },
    2: { id: 2, name: "bar", skip: false },
  });
});
