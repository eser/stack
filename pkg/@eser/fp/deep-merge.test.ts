// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { deepMerge, DeepMergeError } from "./deep-merge.ts";

type Dummy1Prop = {
  inners: {
    inner1: number;
    inner2: Array<number>;
    inner3?: number;
  };
  outer?: string;
};

class Dummy1 {
  prop: Dummy1Prop;

  constructor(prop: Dummy1Prop) {
    this.prop = prop;
  }
}

type Dummy2Prop = {
  inners: {
    inner2: Array<number>;
    inner3: number;
  };
  outer: string;
};

class Dummy2 {
  prop: Dummy2Prop;

  constructor(prop: Dummy2Prop) {
    this.prop = prop;
  }
}

Deno.test("basic", () => {
  const obj1 = {
    a: {
      b: [1, 2, 3],
      c: {
        d: 4,
      },
    },
  };

  const obj2 = {
    a: {
      b: [55],
    },
    e: "hello",
  };

  const result = deepMerge(obj1, obj2);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertNotStrictEquals(result, obj2);
  assert.assertStrictEquals(result.constructor, Object);
  assert.assertEquals(result, {
    a: {
      b: [55],
      c: {
        d: 4,
      },
    },
    e: "hello",
  });
});

Deno.test("classes", () => {
  const obj1 = new Dummy1({
    inners: {
      inner1: 1,
      inner2: [2, 3],
    },
  });

  const obj2 = new Dummy2({
    inners: {
      inner2: [4, 5],
      inner3: 6,
    },
    outer: "sub-mariner",
  });

  const result = deepMerge(obj1, obj2);

  assert.assertNotStrictEquals(result, obj1);
  assert.assertNotStrictEquals(result, obj2);
  assert.assertStrictEquals(result.constructor, Dummy1);
  assert.assertEquals(
    result,
    new Dummy1({
      inners: {
        inner1: 1,
        inner2: [4, 5],
        inner3: 6,
      },
      outer: "sub-mariner",
    }),
  );
});

// ============================================================================
// Circular Reference Detection Tests
// ============================================================================

Deno.test("deepMerge() should detect circular reference in first argument", () => {
  // deno-lint-ignore no-explicit-any
  const obj1: any = { value: 1 };
  obj1.self = obj1;

  const obj2 = { extra: "data" };

  assert.assertThrows(
    () => deepMerge(obj1, obj2),
    DeepMergeError,
    "Circular reference detected",
  );
});

Deno.test("deepMerge() should detect circular reference in second argument", () => {
  const obj1 = { value: 1 };

  // deno-lint-ignore no-explicit-any
  const obj2: any = { extra: "data" };
  obj2.self = obj2;

  assert.assertThrows(
    () => deepMerge(obj1, obj2),
    DeepMergeError,
    "Circular reference detected",
  );
});

Deno.test("deepMerge() should detect deep circular references", () => {
  // deno-lint-ignore no-explicit-any
  const obj1: any = {
    level1: {
      level2: {
        level3: {},
      },
    },
  };
  obj1.level1.level2.level3.backRef = obj1;

  const obj2 = { extra: "data" };

  assert.assertThrows(
    () => deepMerge(obj1, obj2),
    DeepMergeError,
    "Circular reference detected",
  );
});

Deno.test("deepMerge() should detect mutually circular references", () => {
  // deno-lint-ignore no-explicit-any
  const objA: any = { name: "A" };
  // deno-lint-ignore no-explicit-any
  const objB: any = { name: "B" };
  objA.ref = objB;
  objB.ref = objA;

  assert.assertThrows(
    () => deepMerge(objA, {}),
    DeepMergeError,
    "Circular reference detected",
  );
});

// ============================================================================
// Max Depth Tests
// ============================================================================

Deno.test("deepMerge() should merge objects within max depth", () => {
  const obj1 = { a: { b: { c: 1 } } };
  const obj2 = { a: { b: { d: 2 } } };

  const result = deepMerge(obj1, obj2, { maxDepth: 10 });

  assert.assertEquals(result, { a: { b: { c: 1, d: 2 } } });
});

Deno.test("deepMerge() should throw when exceeding max depth", () => {
  const obj1 = { a: { b: { c: { d: 1 } } } };
  const obj2 = { a: { b: { c: { e: 2 } } } };

  assert.assertThrows(
    () => deepMerge(obj1, obj2, { maxDepth: 2 }),
    DeepMergeError,
    "Maximum recursion depth exceeded",
  );
});

Deno.test("deepMerge() should allow custom max depth", () => {
  // Object structure: root (depth 0) -> a (depth 1) -> b (depth 2) -> c (primitive)
  const obj1 = { a: { b: { c: 1 } } };
  const obj2 = { a: { b: { d: 2 } } };

  // Should succeed with maxDepth of 2 (we reach depth 2 when accessing 'b')
  const result = deepMerge(obj1, obj2, { maxDepth: 2 });
  assert.assertEquals(result.a.b.c, 1);
  assert.assertEquals(result.a.b.d, 2);

  // Should fail with maxDepth of 1 (can't reach depth 2 for 'b')
  assert.assertThrows(
    () => deepMerge(obj1, obj2, { maxDepth: 1 }),
    DeepMergeError,
    "Maximum recursion depth exceeded",
  );
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("deepMerge() should handle undefined second argument", () => {
  const obj1 = { a: 1, b: { c: 2 } };

  // deno-lint-ignore no-explicit-any
  const result = deepMerge(obj1, undefined as any);

  assert.assertEquals(result.a, 1);
  assert.assertEquals(result.b.c, 2);
});

Deno.test("deepMerge() should handle null values", () => {
  const obj1 = { a: null, b: { c: null } };
  const obj2 = { b: { d: null } };

  const result = deepMerge(obj1, obj2);

  assert.assertEquals(result.a, null);
  assert.assertEquals(result.b.c, null);
  assert.assertEquals(result.b.d, null);
});

Deno.test("deepMerge() should override primitives with objects", () => {
  // deno-lint-ignore no-explicit-any
  const obj1: any = { a: 1 };
  // deno-lint-ignore no-explicit-any
  const obj2: any = { a: { nested: true } };

  const result = deepMerge(obj1, obj2);

  assert.assertEquals(result.a, { nested: true });
});

Deno.test("deepMerge() should override objects with primitives", () => {
  // deno-lint-ignore no-explicit-any
  const obj1: any = { a: { nested: true } };
  // deno-lint-ignore no-explicit-any
  const obj2: any = { a: 1 };

  const result = deepMerge(obj1, obj2);

  assert.assertEquals(result.a, 1);
});

Deno.test("deepMerge() should handle arrays as values (not merged)", () => {
  const obj1 = { arr: [1, 2, 3] };
  const obj2 = { arr: [4, 5] };

  const result = deepMerge(obj1, obj2);

  // Arrays should be replaced, not merged
  assert.assertEquals(result.arr, [4, 5]);
});
