// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { associateArray } from "./associate-array.ts";

bdd.describe("cool/fp/associate-array", () => {
  bdd.it("basic", () => {
    const arr1 = [
      { id: 1, name: "foo" },
      { id: 2, name: "bar" },
      { id: 3, name: "baz" },
    ];
    const func1 = (value: { id: number }) => value.id;

    const result = associateArray(arr1, func1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> arr1);
    assert.assertEquals(Object.keys(result).length, 3);
    assert.assertEquals(result, {
      1: { id: 1, name: "foo" },
      2: { id: 2, name: "bar" },
      3: { id: 3, name: "baz" },
    });
  });

  bdd.it("with-value-skipping", () => {
    const arr1 = [
      { id: 1, name: "foo", skip: false },
      { id: 2, name: "bar", skip: false },
      { id: 3, name: "baz", skip: true },
    ];
    const func1 = (value: { id: number; skip: boolean }) =>
      value.skip ? undefined : value.id;

    const result = associateArray(arr1, func1);

    // deno-lint-ignore no-explicit-any
    assert.assertNotStrictEquals(<any> result, <any> arr1);
    assert.assertEquals(Object.keys(result).length, 2);
    assert.assertEquals(result, {
      1: { id: 1, name: "foo", skip: false },
      2: { id: 2, name: "bar", skip: false },
    });
  });
});
