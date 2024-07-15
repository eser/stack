// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { pickFromArray } from "./pick-from-array.ts";

Deno.test("basic", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const arr2 = [2, 3, 6];

  const result = pickFromArray(arr1, arr2);

  assert.assertNotStrictEquals(result.items, arr1);
  assert.assertNotStrictEquals(result.items, arr2);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  assert.assertNotStrictEquals(result.rest, arr1);
  assert.assertNotStrictEquals(result.rest, arr2);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});

Deno.test("with-generator-1", () => {
  const gen1 = function* () {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
  };

  const arr1 = [2, 3, 6];

  const generated1 = gen1();
  const result = pickFromArray(generated1, arr1);

  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result.items, <any> generated1);
  assert.assertNotStrictEquals(result.items, arr1);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result.rest, <any> generated1);
  assert.assertNotStrictEquals(result.rest, arr1);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});

Deno.test("with-generator-2", () => {
  const arr1 = [1, 2, 3, 4, 5];
  const gen1 = function* () {
    yield 2;
    yield 3;
    yield 6;
  };

  const generated1 = gen1();
  const result = pickFromArray(arr1, generated1);

  assert.assertNotStrictEquals(result.items, arr1);
  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result.items, <any> generated1);
  assert.assertEquals(result.items.length, 2);
  assert.assertEquals(result.items, [2, 3]);

  assert.assertNotStrictEquals(result.rest, arr1);
  // deno-lint-ignore no-explicit-any
  assert.assertNotStrictEquals(<any> result.rest, <any> generated1);
  assert.assertEquals(result.rest.length, 3);
  assert.assertEquals(result.rest, [1, 4, 5]);
});
