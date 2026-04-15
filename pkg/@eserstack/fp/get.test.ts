// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { get } from "./get.ts";

Deno.test("basic", () => {
  const obj = { a: { b: { c: 42 } } };

  const result = get(obj, ["a", "b", "c"]);

  assert.assertEquals(result, 42);
});

Deno.test("missing-path", () => {
  const obj = { a: { b: 1 } };

  const result = get(obj, ["a", "b", "c", "d"]);

  assert.assertEquals(result, undefined);
});

Deno.test("default-value", () => {
  const obj = { a: { b: 1 } };

  const result = get(obj, ["x", "y"], "default");

  assert.assertEquals(result, "default");
});

Deno.test("null-object", () => {
  const result = get(null, ["a", "b"], "default");

  assert.assertEquals(result, "default");
});

Deno.test("undefined-object", () => {
  const result = get(undefined, ["a", "b"], "default");

  assert.assertEquals(result, "default");
});

Deno.test("empty-path", () => {
  const obj = { a: 1 };

  const result = get(obj, []);

  assert.assertEquals(result, { a: 1 });
});

Deno.test("array-access", () => {
  const obj = { items: [1, 2, 3] };

  const result = get(obj, ["items", 1]);

  assert.assertEquals(result, 2);
});

Deno.test("nested-null", () => {
  const obj = { a: null };

  const result = get(obj, ["a", "b"], "default");

  assert.assertEquals(result, "default");
});

Deno.test("falsy-values", () => {
  const obj = { a: { b: 0, c: "", d: false } };

  assert.assertEquals(get(obj, ["a", "b"]), 0);
  assert.assertEquals(get(obj, ["a", "c"]), "");
  assert.assertEquals(get(obj, ["a", "d"]), false);
});

Deno.test("default-not-used-for-existing", () => {
  const obj = { a: { b: null } };

  // null is a value, not undefined, so default is not used
  const result = get(obj, ["a", "b"], "default");

  assert.assertEquals(result, null);
});
