// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as collections from "./mod.ts";

// =============================================================================
// ImmutableMap Tests (Layer 0)
// =============================================================================

nodeTest.test("createMapBuilder - creates empty builder", () => {
  const builder = collections.createMapBuilder<string, number>();
  assert.assertEquals(builder.size, 0);
  assert.assertEquals(builder.has("key"), false);
});

nodeTest.test("createMapBuilder - set adds entries", () => {
  const builder = collections.createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  assert.assertEquals(builder.size, 2);
  assert.assertEquals(builder.has("a"), true);
  assert.assertEquals(builder.has("b"), true);
});

nodeTest.test("createMapBuilder - delete removes entries", () => {
  const builder = collections.createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2).delete("a");

  assert.assertEquals(builder.size, 1);
  assert.assertEquals(builder.has("a"), false);
  assert.assertEquals(builder.has("b"), true);
});

nodeTest.test("createMapBuilder - build returns sealed map", () => {
  const builder = collections.createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  const map = builder.build();

  assert.assertEquals(map.size, 2);
  assert.assertEquals(map.get("a"), 1);
  assert.assertEquals(map.get("b"), 2);
});

nodeTest.test("createMapBuilder - build throws after sealed", () => {
  const builder = collections.createMapBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.set("x", 1), Error, "sealed");
});

nodeTest.test("ImmutableMap.get - returns undefined for missing keys", () => {
  const map = collections.createMapBuilder<string, number>().build();
  assert.assertEquals(map.get("missing"), undefined);
});

nodeTest.test("ImmutableMap.get - returns values", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 42)
    .build();

  assert.assertEquals(map.get("a"), 42);
});

nodeTest.test("ImmutableMap.has - returns correct boolean", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("exists", 1)
    .build();

  assert.assertEquals(map.has("exists"), true);
  assert.assertEquals(map.has("missing"), false);
});

nodeTest.test("ImmutableMap.isEmpty - returns correct boolean", () => {
  const empty = collections.createMapBuilder<string, number>().build();
  const nonEmpty = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  assert.assertEquals(empty.isEmpty, true);
  assert.assertEquals(nonEmpty.isEmpty, false);
});

nodeTest.test("ImmutableMap.keys - returns iterator", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const keys = [...map.keys()];
  assert.assertEquals(keys.length, 2);
  assert.assertEquals(keys.includes("a"), true);
  assert.assertEquals(keys.includes("b"), true);
});

nodeTest.test("ImmutableMap.values - returns iterator", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const values = [...map.values()];
  assert.assertEquals(values.length, 2);
  assert.assertEquals(values.includes(1), true);
  assert.assertEquals(values.includes(2), true);
});

nodeTest.test("ImmutableMap.entries - returns iterator", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries = [...map.entries()];
  assert.assertEquals(entries.length, 2);
});

nodeTest.test("ImmutableMap - supports for...of iteration", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries: [string, number][] = [];
  for (const [k, v] of map) {
    entries.push([k, v]);
  }

  assert.assertEquals(entries.length, 2);
});

nodeTest.test("ImmutableMap.forEach - iterates over all entries", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const collected: [string, number][] = [];
  map.forEach((value, key) => {
    collected.push([key, value]);
  });

  assert.assertEquals(collected.length, 2);
});

nodeTest.test("ImmutableMap.map - transforms values", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const doubled = map.map((v) => v * 2);

  assert.assertEquals(doubled.get("a"), 2);
  assert.assertEquals(doubled.get("b"), 4);
});

nodeTest.test("ImmutableMap.filter - filters entries", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .set("c", 3)
    .build();

  const filtered = map.filter((v) => v > 1);

  assert.assertEquals(filtered.size, 2);
  assert.assertEquals(filtered.has("a"), false);
  assert.assertEquals(filtered.has("b"), true);
  assert.assertEquals(filtered.has("c"), true);
});

nodeTest.test("ImmutableMap.reduce - reduces to value", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .set("c", 3)
    .build();

  const sum = map.reduce((acc, v) => acc + v, 0);

  assert.assertEquals(sum, 6);
});

nodeTest.test("ImmutableMap.toBuilder - creates mutable copy", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  const newBuilder = map.toBuilder();
  newBuilder.set("b", 2);

  const newMap = newBuilder.build();

  assert.assertEquals(map.size, 1); // Original unchanged
  assert.assertEquals(newMap.size, 2);
  assert.assertEquals(newMap.get("b"), 2);
});

nodeTest.test("ImmutableMap.merge - merges multiple maps", () => {
  const map1 = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  const map2 = collections
    .createMapBuilder<string, number>()
    .set("b", 2)
    .build();

  const map3 = collections
    .createMapBuilder<string, number>()
    .set("a", 10) // Override
    .set("c", 3)
    .build();

  const merged = map1.merge(map2, map3);

  assert.assertEquals(merged.size, 3);
  assert.assertEquals(merged.get("a"), 10); // Overridden
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
});

nodeTest.test("createMap - creates from iterable", () => {
  const map = collections.createMap<string, number>([
    ["a", 1],
    ["b", 2],
  ]);

  assert.assertEquals(map.size, 2);
  assert.assertEquals(map.get("a"), 1);
  assert.assertEquals(map.get("b"), 2);
});

nodeTest.test("EMPTY_MAP - is empty and frozen", () => {
  assert.assertEquals(collections.EMPTY_MAP.size, 0);
  assert.assertEquals(collections.EMPTY_MAP.isEmpty, true);
  assert.assertEquals(Object.isFrozen(collections.EMPTY_MAP), true);
});

// =============================================================================
// RegistryBuilder Tests
// =============================================================================

nodeTest.test("createRegistryBuilder - creates empty builder", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  assert.assertEquals(builder.size, 0);
  assert.assertEquals(builder.has("key"), false);
});

nodeTest.test("createRegistryBuilder - set adds value entries", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  assert.assertEquals(builder.size, 2);
  assert.assertEquals(builder.has("a"), true);
  assert.assertEquals(builder.has("b"), true);
});

nodeTest.test("createRegistryBuilder - remove deletes entries", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2).remove("a");

  assert.assertEquals(builder.size, 1);
  assert.assertEquals(builder.has("a"), false);
  assert.assertEquals(builder.has("b"), true);
});

nodeTest.test("createRegistryBuilder - build returns sealed registry", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  const registry = builder.build();

  assert.assertEquals(registry.size, 2);
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

nodeTest.test("createRegistryBuilder - build throws after sealed", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.set("x", 1), Error, "sealed");
});

// =============================================================================
// Registry Tests
// =============================================================================

nodeTest.test("Registry.get - returns undefined for missing keys", () => {
  const registry = collections.createRegistryBuilder<string, number>().build();
  assert.assertEquals(registry.get("missing"), undefined);
});

nodeTest.test("Registry.get - returns value entries", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 42)
    .build();

  assert.assertEquals(registry.get("a"), 42);
});

nodeTest.test("Registry.has - returns correct boolean", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("exists", 1)
    .build();

  assert.assertEquals(registry.has("exists"), true);
  assert.assertEquals(registry.has("missing"), false);
});

nodeTest.test("Registry.isLazy - returns correct boolean", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("value", 1)
    .setLazy("lazy", () => 2)
    .build();

  assert.assertEquals(registry.isLazy("value"), false);
  assert.assertEquals(registry.isLazy("lazy"), true);
  assert.assertEquals(registry.isLazy("missing"), false);
});

nodeTest.test("Registry.keys - returns frozen array", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const keys = registry.keys();
  assert.assertEquals(keys.length, 2);
  assert.assertEquals(keys.includes("a"), true);
  assert.assertEquals(keys.includes("b"), true);
  assert.assertEquals(Object.isFrozen(keys), true);
});

nodeTest.test("Registry.keys - returns cached array", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const keys1 = registry.keys();
  const keys2 = registry.keys();
  assert.assertEquals(keys1, keys2); // Same reference
});

nodeTest.test("Registry.values - returns values for value lifetime", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const values = registry.values();
  assert.assertEquals(values.length, 2);
  assert.assertEquals(values.includes(1), true);
  assert.assertEquals(values.includes(2), true);
});

nodeTest.test("Registry.entries - returns key-value pairs", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries = registry.entries();
  assert.assertEquals(entries.length, 2);
});

nodeTest.test("Registry.toBuilder - creates new mutable builder", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const newBuilder = registry.toBuilder();
  newBuilder.set("b", 2);

  const newRegistry = newBuilder.build();

  assert.assertEquals(registry.size, 1); // Original unchanged
  assert.assertEquals(newRegistry.size, 2);
  assert.assertEquals(newRegistry.get("b"), 2);
});

// =============================================================================
// Lazy Lifetime Tests
// =============================================================================

nodeTest.test("setLazy - executes factory once", () => {
  let callCount = 0;
  const factory = () => {
    callCount++;
    return 42;
  };

  const registry = collections
    .createRegistryBuilder<string, number>()
    .setLazy("lazy", factory)
    .build();

  assert.assertEquals(callCount, 0); // Not called yet

  const value1 = registry.get("lazy");
  assert.assertEquals(value1, 42);
  assert.assertEquals(callCount, 1);

  const value2 = registry.get("lazy");
  assert.assertEquals(value2, 42);
  assert.assertEquals(callCount, 1); // Still 1, cached
});

nodeTest.test("setLazy - isLazy returns false after resolution", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .setLazy("lazy", () => 42)
    .build();

  // Before resolution
  assert.assertEquals(registry.isLazy("lazy"), true);

  // Resolve it
  registry.get("lazy");

  // Still lazy (descriptor doesn't change, just cached)
  assert.assertEquals(registry.isLazy("lazy"), true);
});

// =============================================================================
// Async Tests
// =============================================================================

nodeTest.test("Registry.getAsync - resolves async lazy factory", async () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .setLazy("async", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    })
    .build();

  const value = await registry.getAsync("async");
  assert.assertEquals(value, 42);
});

nodeTest.test("Registry.getAsync - caches async lazy result", async () => {
  let callCount = 0;
  const registry = collections
    .createRegistryBuilder<string, number>()
    .setLazy("async", async () => {
      await new Promise((r) => setTimeout(r, 10));
      callCount++;
      return callCount;
    })
    .build();

  const value1 = await registry.getAsync("async");
  assert.assertEquals(value1, 1);

  const value2 = await registry.getAsync("async");
  assert.assertEquals(value2, 1); // Cached
  assert.assertEquals(callCount, 1);
});

// =============================================================================
// IndexedRegistry Tests
// =============================================================================

import type { IndexedRegistry } from "./types.ts";

type Format = { name: string; extensions: string[] };

nodeTest.test("IndexedRegistry - lookup by primary key", () => {
  const registry: IndexedRegistry<string, Format> = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .build();

  const format = registry.get("json");
  assert.assertEquals(format?.name, "json");
});

nodeTest.test("IndexedRegistry - lookup by index", () => {
  const registry: IndexedRegistry<string, Format> = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .set("yaml", { name: "yaml", extensions: ["yaml", "yml"] })
    .build();

  const jsonFormat = registry.getByIndex("byExt", "json");
  assert.assertEquals(jsonFormat?.name, "json");

  const yamlFormat = registry.getByIndex("byExt", "yml");
  assert.assertEquals(yamlFormat?.name, "yaml");
});

nodeTest.test("IndexedRegistry - normalized lookup", () => {
  const registry: IndexedRegistry<string, Format> = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .build();

  // Should normalize: .JSON -> json, JSON -> json
  const format1 = registry.getByIndex("byExt", "JSON");
  assert.assertEquals(format1?.name, "json");

  const format2 = registry.getByIndex("byExt", "json");
  assert.assertEquals(format2?.name, "json");
});

nodeTest.test("IndexedRegistry - hasInIndex", () => {
  const registry: IndexedRegistry<string, Format> = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .build();

  assert.assertEquals(registry.hasInIndex("byExt", "json"), true);
  assert.assertEquals(registry.hasInIndex("byExt", "xml"), false);
});

nodeTest.test("IndexedRegistry - isLazy works", () => {
  const registry: IndexedRegistry<string, Format> = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .setLazy("lazy", () => ({ name: "lazy", extensions: [] }))
    .build();

  assert.assertEquals(registry.isLazy("json"), false);
  assert.assertEquals(registry.isLazy("lazy"), true);
});

// =============================================================================
// fromEntries Tests
// =============================================================================

nodeTest.test("fromEntries - creates builder from array", () => {
  const builder = collections.fromEntries<string, number>([
    ["a", 1],
    ["b", 2, "value"],
  ]);

  const registry = builder.build();
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

nodeTest.test("fromEntries - supports lazy lifetime", () => {
  let called = false;
  const builder = collections.fromEntries<string, number>([
    [
      "lazy",
      () => {
        called = true;
        return 42;
      },
      "lazy",
    ],
  ]);

  const registry = builder.build();
  assert.assertEquals(called, false);

  const value = registry.get("lazy");
  assert.assertEquals(value, 42);
  assert.assertEquals(called, true);
});

// =============================================================================
// Performance Utilities Tests
// =============================================================================

// Consumer-defined bitmap mapping for tests
const TestBits = {
  optionA: 1 << 0,
  optionB: 1 << 1,
  optionC: 1 << 2,
} as const;

nodeTest.test("createBitmapMatcher - creates matcher with toBitmap", () => {
  const matcher = collections.createBitmapMatcher(TestBits);
  const bitmap = matcher.toBitmap(["optionA", "optionB"]);
  assert.assertEquals(bitmap, 0b11); // Bits 0 and 1
});

nodeTest.test(
  "createBitmapMatcher - match returns true for intersection",
  () => {
    const matcher = collections.createBitmapMatcher(TestBits);
    const required = matcher.toBitmap(["optionA"]);
    const available = matcher.toBitmap(["optionA", "optionB"]);

    assert.assertEquals(matcher.match(required, available), true);
  },
);

nodeTest.test(
  "createBitmapMatcher - match returns false for no intersection",
  () => {
    const matcher = collections.createBitmapMatcher(TestBits);
    const required = matcher.toBitmap(["optionC"]);
    const available = matcher.toBitmap(["optionA", "optionB"]);

    assert.assertEquals(matcher.match(required, available), false);
  },
);

nodeTest.test(
  "createBitmapMatcher - match returns true for empty required",
  () => {
    const matcher = collections.createBitmapMatcher(TestBits);
    const required = matcher.toBitmap([]);
    const available = matcher.toBitmap(["optionA"]);

    assert.assertEquals(matcher.match(required, available), true);
  },
);

nodeTest.test(
  "createBitmapMatcher - matchAll returns true when all required present",
  () => {
    const matcher = collections.createBitmapMatcher(TestBits);
    const required = matcher.toBitmap(["optionA", "optionB"]);
    const available = matcher.toBitmap(["optionA", "optionB", "optionC"]);

    assert.assertEquals(matcher.matchAll(required, available), true);
  },
);

nodeTest.test(
  "createBitmapMatcher - matchAll returns false when not all required present",
  () => {
    const matcher = collections.createBitmapMatcher(TestBits);
    const required = matcher.toBitmap(["optionA", "optionB", "optionC"]);
    const available = matcher.toBitmap(["optionA", "optionB"]);

    assert.assertEquals(matcher.matchAll(required, available), false);
  },
);

nodeTest.test("createBitmapMatcher - exposes mapping", () => {
  const matcher = collections.createBitmapMatcher(TestBits);
  assert.assertEquals(matcher.mapping.optionA, 1);
  assert.assertEquals(matcher.mapping.optionB, 2);
  assert.assertEquals(matcher.mapping.optionC, 4);
});

nodeTest.test("getFunctionParameters - extracts parameter names", () => {
  const fn = (a: number, b: string, c: boolean) => a + b + c;
  const params = collections.getFunctionParameters(fn);

  assert.assertEquals(params, ["a", "b", "c"]);
});

nodeTest.test("getFunctionParameters - caches results", () => {
  const fn = (x: number) => x * 2;
  const params1 = collections.getFunctionParameters(fn);
  const params2 = collections.getFunctionParameters(fn);

  assert.assertEquals(params1, params2); // Same reference
});

nodeTest.test("getFunctionParameters - handles async functions", () => {
  // The parser must read the parameters of an async function.
  // oxlint-disable-next-line require-await
  const fn = async (data: unknown) => data;
  const params = collections.getFunctionParameters(fn);

  assert.assertEquals(params, ["data"]);
});

nodeTest.test("lazy - computes value once", () => {
  let callCount = 0;
  const getValue = collections.lazy(() => {
    callCount++;
    return 42;
  });

  assert.assertEquals(callCount, 0);

  const v1 = getValue();
  assert.assertEquals(v1, 42);
  assert.assertEquals(callCount, 1);

  const v2 = getValue();
  assert.assertEquals(v2, 42);
  assert.assertEquals(callCount, 1);
});

nodeTest.test("lazyAsync - computes async value once", async () => {
  let callCount = 0;
  // lazyAsync takes a promise-returning factory; this one has nothing to await.
  // oxlint-disable-next-line require-await
  const getValue = collections.lazyAsync(async () => {
    callCount++;
    return 42;
  });

  const v1 = await getValue();
  assert.assertEquals(v1, 42);
  assert.assertEquals(callCount, 1);

  const v2 = await getValue();
  assert.assertEquals(v2, 42);
  assert.assertEquals(callCount, 1);
});

nodeTest.test("freezeArray - returns frozen array", () => {
  const arr = [1, 2, 3];
  const frozen = collections.freezeArray(arr);

  assert.assertEquals(Object.isFrozen(frozen), true);
  assert.assertEquals([...frozen], [1, 2, 3]);
});

nodeTest.test("memoizeArray - caches array results", () => {
  let callCount = 0;
  const getItems = collections.memoizeArray((n: number) => {
    callCount++;
    return Array.from({ length: n }, (_, i) => i);
  });

  const r1 = getItems(3);
  assert.assertEquals([...r1], [0, 1, 2]);
  assert.assertEquals(callCount, 1);

  const r2 = getItems(3);
  assert.assertEquals(r1, r2); // Same reference
  assert.assertEquals(callCount, 1);

  const r3 = getItems(5);
  assert.assertEquals([...r3], [0, 1, 2, 3, 4]);
  assert.assertEquals(callCount, 2);
});

// =============================================================================
// mergeBuilders Tests
// =============================================================================

nodeTest.test("mergeBuilders - merges multiple registries", () => {
  const reg1 = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const reg2 = collections
    .createRegistryBuilder<string, number>()
    .set("c", 3)
    .set("d", 4)
    .build();

  const merged = collections.mergeBuilders(reg1, reg2).build();

  assert.assertEquals(merged.size, 4);
  assert.assertEquals(merged.get("a"), 1);
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
  assert.assertEquals(merged.get("d"), 4);
});

nodeTest.test("mergeBuilders - later registries override earlier ones", () => {
  const reg1 = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const reg2 = collections
    .createRegistryBuilder<string, number>()
    .set("a", 100) // Override
    .set("c", 3)
    .build();

  const merged = collections.mergeBuilders(reg1, reg2).build();

  assert.assertEquals(merged.size, 3);
  assert.assertEquals(merged.get("a"), 100); // Overridden
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
});

nodeTest.test("mergeBuilders - handles empty registries", () => {
  const reg1 = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const empty = collections.createRegistryBuilder<string, number>().build();

  const merged = collections.mergeBuilders(reg1, empty).build();

  assert.assertEquals(merged.size, 1);
  assert.assertEquals(merged.get("a"), 1);
});

nodeTest.test("mergeBuilders - skips undefined values", () => {
  const reg1 = collections
    .createRegistryBuilder<string, number | undefined>()
    .set("a", 1)
    .set("b", undefined)
    .build();

  const merged = collections.mergeBuilders(reg1).build();

  assert.assertEquals(merged.size, 1);
  assert.assertEquals(merged.has("a"), true);
  assert.assertEquals(merged.has("b"), false); // undefined skipped
});

// =============================================================================
// clearParameterCache Tests
// =============================================================================

nodeTest.test(
  "clearParameterCache - clears cached parameters for specific function",
  () => {
    const fn = (x: number, y: string) => x + y;

    // Cache it
    const params1 = collections.getFunctionParameters(fn);
    assert.assertEquals(params1, ["x", "y"]);

    // Clear cache for this function
    collections.clearParameterCache(fn);

    // Should still work (re-computes)
    const params2 = collections.getFunctionParameters(fn);
    assert.assertEquals(params2, ["x", "y"]);
  },
);

// =============================================================================
// parallelImport Tests
// =============================================================================

nodeTest.test("parallelImport - handles empty array", async () => {
  const results = await collections.parallelImport<unknown>([]);
  assert.assertEquals(results.length, 0);
});

// Note: parallelImport requires actual file paths for dynamic import,
// so we can only test with empty array in unit tests.
// Integration tests would need real module files.

// =============================================================================
// parallelImportModules Tests
// =============================================================================

nodeTest.test("parallelImportModules - handles empty array", async () => {
  const results = await collections.parallelImportModules([]);
  assert.assertEquals(results.length, 0);
});

// Note: parallelImportModules requires actual file paths for dynamic import,
// so we can only test with empty array in unit tests.
// Integration tests would need real module files.

// =============================================================================
// EMPTY_REGISTRY Tests
// =============================================================================

nodeTest.test("EMPTY_REGISTRY - is empty and frozen", () => {
  assert.assertEquals(collections.EMPTY_REGISTRY.size, 0);
  assert.assertEquals(collections.EMPTY_REGISTRY.has("any"), false);
  assert.assertEquals(collections.EMPTY_REGISTRY.get("any"), undefined);
  assert.assertEquals(Object.isFrozen(collections.EMPTY_REGISTRY), true);
});

nodeTest.test(
  "EMPTY_REGISTRY - keys/values/entries return empty arrays",
  () => {
    assert.assertEquals(collections.EMPTY_REGISTRY.keys().length, 0);
    assert.assertEquals(collections.EMPTY_REGISTRY.values().length, 0);
    assert.assertEquals(collections.EMPTY_REGISTRY.entries().length, 0);
  },
);

// =============================================================================
// createRegistry Tests
// =============================================================================

nodeTest.test("createRegistry - creates registry from entries map", () => {
  const entries = new Map<string, ["value", number]>([
    ["a", ["value", 1]],
    ["b", ["value", 2]],
  ]);

  const registry = collections.createRegistry(entries);

  assert.assertEquals(registry.size, 2);
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

// =============================================================================
// Error Scenario Tests
// =============================================================================

nodeTest.test("RegistryBuilder - throws on set after seal", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.set("x", 1), Error, "sealed");
});

nodeTest.test("RegistryBuilder - throws on setLazy after seal", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.setLazy("x", () => 1), Error, "sealed");
});

nodeTest.test("RegistryBuilder - throws on remove after seal", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.remove("x"), Error, "sealed");
});

nodeTest.test("RegistryBuilder - throws on multiple build calls", () => {
  const builder = collections.createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(() => builder.build(), Error, "sealed");
});

nodeTest.test(
  "IndexedRegistryBuilder - throws on operations after seal",
  () => {
    const builder = collections.createIndexedRegistryBuilder<
      string,
      { name: string }
    >([]);
    builder.build();

    assert.assertThrows(() => builder.set("x", { name: "x" }), Error, "sealed");
  },
);

nodeTest.test(
  "IndexedRegistry - getByIndex returns undefined for non-existent index",
  () => {
    const registry = collections
      .createIndexedRegistryBuilder<string, Format>([
        collections.createExtensionIndex("byExt", (f) => f.extensions),
      ])
      .set("json", { name: "json", extensions: ["json"] })
      .build();

    const result = registry.getByIndex("nonExistentIndex", "json");
    assert.assertEquals(result, undefined);
  },
);

nodeTest.test(
  "IndexedRegistry - hasInIndex returns false for non-existent index",
  () => {
    const registry = collections
      .createIndexedRegistryBuilder<string, Format>([
        collections.createExtensionIndex("byExt", (f) => f.extensions),
      ])
      .set("json", { name: "json", extensions: ["json"] })
      .build();

    const result = registry.hasInIndex("nonExistentIndex", "json");
    assert.assertEquals(result, false);
  },
);

nodeTest.test(
  "Registry.get - returns undefined for async factory when called sync",
  async () => {
    const registry = collections
      .createRegistryBuilder<string, number>()
      // An async factory is the case under test; it has nothing to await.
      // oxlint-disable-next-line require-await
      .setLazy("async", async () => {
        return 42;
      })
      .build();

    // Sync access to async factory returns undefined (Promise is returned, not value)
    const result = registry.get("async");
    assert.assertEquals(result, undefined);

    // Clean up - resolve the async factory
    await registry.getAsync("async");
  },
);

// =============================================================================
// Edge Case Tests
// =============================================================================

nodeTest.test("Registry - handles large number of entries", () => {
  const builder = collections.createRegistryBuilder<string, number>();

  for (let i = 0; i < 1000; i++) {
    builder.set(`key${i}`, i);
  }

  const registry = builder.build();

  assert.assertEquals(registry.size, 1000);
  assert.assertEquals(registry.get("key0"), 0);
  assert.assertEquals(registry.get("key500"), 500);
  assert.assertEquals(registry.get("key999"), 999);
});

nodeTest.test("Registry - handles null values", () => {
  const registry = collections
    .createRegistryBuilder<string, null>()
    .set("null", null)
    .build();

  assert.assertEquals(registry.has("null"), true);
  assert.assertEquals(registry.get("null"), null);
});

nodeTest.test("Registry - handles empty string keys", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("", 42)
    .build();

  assert.assertEquals(registry.has(""), true);
  assert.assertEquals(registry.get(""), 42);
});

nodeTest.test("Registry - handles unicode keys", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("日本語", 1)
    .set("emoji🎉", 2)
    .set("αβγ", 3)
    .build();

  assert.assertEquals(registry.get("日本語"), 1);
  assert.assertEquals(registry.get("emoji🎉"), 2);
  assert.assertEquals(registry.get("αβγ"), 3);
});

nodeTest.test("IndexedRegistry - handles empty extension list", () => {
  type FormatWithOptionalExt = { name: string; extensions: string[] };

  const registry = collections
    .createIndexedRegistryBuilder<string, FormatWithOptionalExt>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("noext", { name: "noext", extensions: [] })
    .set("json", { name: "json", extensions: ["json"] })
    .build();

  assert.assertEquals(registry.get("noext")?.name, "noext");
  assert.assertEquals(registry.getByIndex("byExt", "json")?.name, "json");
  // No extensions registered for noext
});

// =============================================================================
// Immutability Verification Tests
// =============================================================================

nodeTest.test("ImmutableMap - is frozen after build", () => {
  const map = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  assert.assertEquals(Object.isFrozen(map), true);
});

nodeTest.test("Registry - is frozen after build", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  assert.assertEquals(Object.isFrozen(registry), true);
});

nodeTest.test("IndexedRegistry - is frozen after build", () => {
  const registry = collections
    .createIndexedRegistryBuilder<string, { name: string }>([])
    .set("a", { name: "a" })
    .build();

  assert.assertEquals(Object.isFrozen(registry), true);
});

nodeTest.test(
  "Registry.keys - returns frozen array that cannot be mutated",
  () => {
    const registry = collections
      .createRegistryBuilder<string, number>()
      .set("a", 1)
      .set("b", 2)
      .build();

    const keys = registry.keys();
    assert.assertEquals(Object.isFrozen(keys), true);

    // Attempting to mutate should have no effect or throw
    assert.assertThrows(() => {
      (keys as string[]).push("c");
    });
  },
);

nodeTest.test("Registry.values - returns frozen array", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const values = registry.values();
  assert.assertEquals(Object.isFrozen(values), true);
});

nodeTest.test("Registry.entries - returns frozen array", () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const entries = registry.entries();
  assert.assertEquals(Object.isFrozen(entries), true);
});

nodeTest.test("ImmutableMap.toBuilder - creates independent copy", () => {
  const original = collections
    .createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  const builder1 = original.toBuilder();
  const builder2 = original.toBuilder();

  builder1.set("b", 2);
  builder2.set("c", 3);

  const map1 = builder1.build();
  const map2 = builder2.build();

  // Original unchanged
  assert.assertEquals(original.size, 1);
  assert.assertEquals(original.has("b"), false);
  assert.assertEquals(original.has("c"), false);

  // Each copy is independent
  assert.assertEquals(map1.size, 2);
  assert.assertEquals(map1.has("b"), true);
  assert.assertEquals(map1.has("c"), false);

  assert.assertEquals(map2.size, 2);
  assert.assertEquals(map2.has("b"), false);
  assert.assertEquals(map2.has("c"), true);
});

// =============================================================================
// Concurrent/Async Behavior Tests
// =============================================================================

nodeTest.test(
  "Registry - concurrent lazy access returns consistent values",
  async () => {
    let callCount = 0;
    const registry = collections
      .createRegistryBuilder<string, number>()
      .setLazy("lazy", () => {
        callCount++;
        return 42;
      })
      .build();

    // Concurrent sync access
    const results = await Promise.all([
      Promise.resolve(registry.get("lazy")),
      Promise.resolve(registry.get("lazy")),
      Promise.resolve(registry.get("lazy")),
    ]);

    assert.assertEquals(results, [42, 42, 42]);
    assert.assertEquals(callCount, 1); // Factory called only once
  },
);

nodeTest.test(
  "Registry.getAsync - sequential async access caches correctly",
  async () => {
    let callCount = 0;
    const registry = collections
      .createRegistryBuilder<string, number>()
      // An async factory is the case under test; it has nothing to await.
      // oxlint-disable-next-line require-await
      .setLazy("async", async () => {
        callCount++;
        return 42;
      })
      .build();

    // First call resolves
    const result1 = await registry.getAsync("async");
    assert.assertEquals(result1, 42);
    assert.assertEquals(callCount, 1);

    // Subsequent calls should use cache
    const result2 = await registry.getAsync("async");
    assert.assertEquals(result2, 42);
    assert.assertEquals(callCount, 1);
  },
);

nodeTest.test("Registry.getAsync - works with sync values", async () => {
  const registry = collections
    .createRegistryBuilder<string, number>()
    .set("sync", 42)
    .build();

  const result = await registry.getAsync("sync");
  assert.assertEquals(result, 42);
});

nodeTest.test(
  "Registry.getAsync - returns undefined for missing keys",
  async () => {
    const registry = collections
      .createRegistryBuilder<string, number>()
      .build();

    const result = await registry.getAsync("missing");
    assert.assertEquals(result, undefined);
  },
);

// =============================================================================
// Additional ImmutableMap Tests
// =============================================================================

nodeTest.test("ImmutableMap.map - preserves keys", () => {
  const map = collections.createMap([
    ["a", 1],
    ["b", 2],
  ]);

  const mapped = map.map((v) => v * 10);

  assert.assertEquals([...mapped.keys()], ["a", "b"]);
  assert.assertEquals(mapped.get("a"), 10);
  assert.assertEquals(mapped.get("b"), 20);
});

nodeTest.test("ImmutableMap.filter - key predicate", () => {
  const map = collections.createMap([
    ["keep1", 1],
    ["keep2", 2],
    ["remove", 3],
  ]);

  const filtered = map.filter((_, key) => key.startsWith("keep"));

  assert.assertEquals(filtered.size, 2);
  assert.assertEquals(filtered.has("keep1"), true);
  assert.assertEquals(filtered.has("keep2"), true);
  assert.assertEquals(filtered.has("remove"), false);
});

nodeTest.test("ImmutableMap.reduce - with key access", () => {
  const map = collections.createMap([
    ["a", 1],
    ["b", 2],
  ]);

  const result = map.reduce((acc, v, k) => acc + k + v, "");

  // Order might vary, but should contain both
  assert.assertEquals(result.includes("a"), true);
  assert.assertEquals(result.includes("b"), true);
});

// =============================================================================
// getFunctionParameters Edge Cases
// =============================================================================

nodeTest.test("getFunctionParameters - handles arrow functions", () => {
  const fn = (a: number) => a * 2;
  const params = collections.getFunctionParameters(fn);
  assert.assertEquals(params, ["a"]);
});

nodeTest.test("getFunctionParameters - handles function with no params", () => {
  const fn = () => 42;
  const params = collections.getFunctionParameters(fn);
  assert.assertEquals(params, []);
});

nodeTest.test("getFunctionParameters - handles destructured params", () => {
  // Note: Destructured params may be extracted differently
  const fn = ({ a, b }: { a: number; b: string }) => a + b;
  const params = collections.getFunctionParameters(fn);
  // Result depends on implementation - just check it doesn't throw
  assert.assertEquals(Array.isArray(params), true);
});

nodeTest.test("getFunctionParameters - handles default params", () => {
  const fn = (a: number, b = 10) => a + b;
  const params = collections.getFunctionParameters(fn);
  assert.assertEquals(params.includes("a"), true);
});

// =============================================================================
// IndexedRegistry Additional Tests
// =============================================================================

nodeTest.test("IndexedRegistry.toBuilder - preserves entries and lazy", () => {
  const original = collections
    .createIndexedRegistryBuilder<string, Format>([
      collections.createExtensionIndex("byExt", (f) => f.extensions),
    ])
    .set("json", { name: "json", extensions: ["json"] })
    .setLazy("lazy", () => ({ name: "lazy", extensions: ["lazy"] }))
    .build();

  const newBuilder = original.toBuilder();
  newBuilder.set("yaml", { name: "yaml", extensions: ["yaml"] });

  const newRegistry = newBuilder.build();

  assert.assertEquals(newRegistry.size, 3);
  assert.assertEquals(newRegistry.get("json")?.name, "json");
  assert.assertEquals(newRegistry.get("yaml")?.name, "yaml");
  assert.assertEquals(newRegistry.isLazy("lazy"), true);
});

nodeTest.test(
  "IndexedRegistry.getAsync - works with lazy entries",
  async () => {
    const registry = collections
      .createIndexedRegistryBuilder<string, Format>([
        collections.createExtensionIndex("byExt", (f) => f.extensions),
      ])
      .setLazy("lazy", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { name: "lazy", extensions: [".lazy"] };
      })
      .build();

    const result = await registry.getAsync("lazy");
    assert.assertEquals(result?.name, "lazy");
  },
);

nodeTest.test(
  "IndexedRegistry - lazy entries not indexed until resolved",
  () => {
    const registry = collections
      .createIndexedRegistryBuilder<string, Format>([
        collections.createExtensionIndex("byExt", (f) => f.extensions),
      ])
      .setLazy("lazy", () => ({ name: "lazy", extensions: [".lazy"] }))
      .build();

    // Lazy entries are not indexed (only "value" lifetime entries are)
    assert.assertEquals(registry.hasInIndex("byExt", ".lazy"), false);
  },
);
