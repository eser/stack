// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { keyBy } from "./key-by.ts";

Deno.test("basic", () => {
  const arr = [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
  ];

  const result = keyBy(arr, (x) => x.id);

  assert.assertEquals(result, {
    a: { id: "a", name: "Alice" },
    b: { id: "b", name: "Bob" },
  });
});

Deno.test("empty-array", () => {
  const result = keyBy([], (x: { id: string }) => x.id);

  assert.assertEquals(result, {});
});

Deno.test("overwriting-keys", () => {
  const arr = [
    { id: "a", value: 1 },
    { id: "a", value: 2 },
  ];

  const result = keyBy(arr, (x) => x.id);

  // Last value wins
  assert.assertEquals(result, { a: { id: "a", value: 2 } });
});

Deno.test("with-string-length", () => {
  const arr = ["one", "two", "three"];

  const result = keyBy(arr, (x) => x.length);

  // 'two' overwrites 'one' at key 3, 'three' gets key 5
  assert.assertEquals(result, { 3: "two", 5: "three" });
});

Deno.test("numeric-keys", () => {
  const arr = [
    { index: 0, name: "first" },
    { index: 1, name: "second" },
  ];

  const result = keyBy(arr, (x) => x.index);

  assert.assertEquals(result[0], { index: 0, name: "first" });
  assert.assertEquals(result[1], { index: 1, name: "second" });
});
