// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { memoize } from "./memoize.ts";

Deno.test("basic", () => {
  let callCount = 0;
  const fn = (x: number) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn);

  assert.assertEquals(memoized(5), 10);
  assert.assertEquals(callCount, 1);
});

Deno.test("cache-hit", () => {
  let callCount = 0;
  const fn = (x: number) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn);

  memoized(5);
  memoized(5);
  memoized(5);

  assert.assertEquals(callCount, 1);
});

Deno.test("different-args", () => {
  let callCount = 0;
  const fn = (x: number) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn);

  memoized(1);
  memoized(2);
  memoized(3);

  assert.assertEquals(callCount, 3);
});

Deno.test("custom-resolver", () => {
  let callCount = 0;
  const fn = (id: string, _options: { force?: boolean }) => {
    callCount++;
    return `result-${id}`;
  };

  const memoized = memoize(fn, (id) => id);

  memoized("a", { force: true });
  memoized("a", { force: false });

  // Same id, different options, but resolver only uses id
  assert.assertEquals(callCount, 1);
});

Deno.test("cache-access", () => {
  const fn = (x: number) => x * 2;

  const memoized = memoize(fn);

  memoized(5);
  memoized(10);

  assert.assertEquals(memoized.cache.size, 2);
  assert.assertEquals(memoized.cache.get(5), 10);
  assert.assertEquals(memoized.cache.get(10), 20);
});

Deno.test("cache-clear", () => {
  let callCount = 0;
  const fn = (x: number) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn);

  memoized(5);
  memoized.cache.clear();
  memoized(5);

  assert.assertEquals(callCount, 2);
});

Deno.test("cache-delete", () => {
  let callCount = 0;
  const fn = (x: number) => {
    callCount++;
    return x * 2;
  };

  const memoized = memoize(fn);

  memoized(5);
  memoized.cache.delete(5);
  memoized(5);

  assert.assertEquals(callCount, 2);
});

Deno.test("object-key", () => {
  const fn = (obj: { id: number }) => obj.id * 2;

  const memoized = memoize(fn);

  const obj1 = { id: 1 };
  const obj2 = { id: 1 }; // Same content, different reference

  memoized(obj1);
  memoized(obj2);

  // Different object references = different cache keys
  assert.assertEquals(memoized.cache.size, 2);
});
