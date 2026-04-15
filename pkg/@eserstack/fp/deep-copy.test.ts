// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { deepCopy, deepCopy2, DeepCopyError } from "./deep-copy.ts";

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

// ============================================================================
// Circular Reference Detection Tests
// ============================================================================

Deno.test("deepCopy() should detect self-referencing circular objects", () => {
  // deno-lint-ignore no-explicit-any
  const obj: any = { value: 1 };
  obj.self = obj;

  assert.assertThrows(
    () => deepCopy(obj),
    DeepCopyError,
    "Circular reference detected",
  );
});

Deno.test("deepCopy() should detect mutually circular references", () => {
  // deno-lint-ignore no-explicit-any
  const objA: any = { name: "A" };
  // deno-lint-ignore no-explicit-any
  const objB: any = { name: "B" };
  objA.ref = objB;
  objB.ref = objA;

  assert.assertThrows(
    () => deepCopy(objA),
    DeepCopyError,
    "Circular reference detected",
  );
});

Deno.test("deepCopy() should detect deep circular references", () => {
  // deno-lint-ignore no-explicit-any
  const obj: any = {
    level1: {
      level2: {
        level3: {},
      },
    },
  };
  obj.level1.level2.level3.backRef = obj;

  assert.assertThrows(
    () => deepCopy(obj),
    DeepCopyError,
    "Circular reference detected",
  );
});

// ============================================================================
// Max Depth Tests
// ============================================================================

Deno.test("deepCopy() should copy objects within max depth", () => {
  const nested = { a: { b: { c: { d: { e: 5 } } } } };

  const result = deepCopy(nested, { maxDepth: 10 });

  assert.assertEquals(result, nested);
  assert.assertNotStrictEquals(result, nested);
  assert.assertNotStrictEquals(result.a, nested.a);
});

Deno.test("deepCopy() should throw when exceeding max depth", () => {
  const nested = { a: { b: { c: { d: { e: 5 } } } } };

  assert.assertThrows(
    () => deepCopy(nested, { maxDepth: 3 }),
    DeepCopyError,
    "Maximum recursion depth exceeded",
  );
});

Deno.test("deepCopy() should allow custom max depth", () => {
  // Create a deeply nested object (5 levels of objects)
  // Level 0: root, Level 1: a, Level 2: b, Level 3: c, Level 4: d
  // e is a primitive (5), so no recursion there
  const nested = { a: { b: { c: { d: { e: 5 } } } } };

  // Should succeed with maxDepth of 4 (we need to reach depth 4 to process 'd')
  const result = deepCopy(nested, { maxDepth: 4 });
  assert.assertEquals(result.a.b.c.d.e, 5);

  // Should fail with maxDepth of 3 (can't reach 'd' at depth 4)
  assert.assertThrows(
    () => deepCopy(nested, { maxDepth: 3 }),
    DeepCopyError,
    "Maximum recursion depth exceeded",
  );
});

// ============================================================================
// Array Handling Tests
// ============================================================================

Deno.test("deepCopy() should handle arrays", () => {
  const obj = { arr: [1, 2, { nested: 3 }] };

  const result = deepCopy(obj);

  assert.assertEquals(result, obj);
  assert.assertNotStrictEquals(result.arr, obj.arr);
  assert.assertNotStrictEquals(result.arr[2], obj.arr[2]);
});

Deno.test("deepCopy() should handle nested arrays", () => {
  const obj = { matrix: [[1, 2], [3, 4]] };

  const result = deepCopy(obj);

  assert.assertEquals(result, obj);
  assert.assertNotStrictEquals(result.matrix, obj.matrix);
  assert.assertNotStrictEquals(result.matrix[0], obj.matrix[0]);
});

Deno.test("deepCopy() should detect circular references in arrays", () => {
  // deno-lint-ignore no-explicit-any
  const arr: any[] = [1, 2, 3];
  arr.push(arr);

  assert.assertThrows(
    () => deepCopy({ items: arr }),
    DeepCopyError,
    "Circular reference detected",
  );
});

// ============================================================================
// deepCopy2 Tests (Alternative Implementation)
// ============================================================================

Deno.test("deepCopy2() should detect circular references", () => {
  // deno-lint-ignore no-explicit-any
  const obj: any = { value: 1 };
  obj.self = obj;

  assert.assertThrows(
    () => deepCopy2(obj),
    DeepCopyError,
    "Circular reference detected",
  );
});

Deno.test("deepCopy2() should respect max depth", () => {
  const nested = { a: { b: { c: { d: { e: 5 } } } } };

  assert.assertThrows(
    () => deepCopy2(nested, { maxDepth: 3 }),
    DeepCopyError,
    "Maximum recursion depth exceeded",
  );
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("deepCopy() should handle null values", () => {
  const obj = { a: null, b: { c: null } };

  const result = deepCopy(obj);

  assert.assertEquals(result, obj);
});

Deno.test("deepCopy() should handle undefined values", () => {
  const obj = { a: undefined, b: { c: undefined } };

  const result = deepCopy(obj);

  assert.assertEquals(result.a, undefined);
  assert.assertEquals(result.b.c, undefined);
});

Deno.test("deepCopy() should handle primitive values in nested objects", () => {
  const obj = {
    num: 42,
    str: "hello",
    bool: true,
    nested: {
      num: 100,
      str: "world",
      bool: false,
    },
  };

  const result = deepCopy(obj);

  assert.assertEquals(result, obj);
  assert.assertNotStrictEquals(result.nested, obj.nested);
});

Deno.test("deepCopy() should allow same object in different branches (non-circular)", () => {
  const shared = { value: 5 };
  const obj = { a: shared, b: shared };

  // This should NOT throw - the same object appearing in different branches
  // is not a circular reference, just shared references
  const result = deepCopy(obj);

  assert.assertEquals(result.a.value, 5);
  assert.assertEquals(result.b.value, 5);
});
