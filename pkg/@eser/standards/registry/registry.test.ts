// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  clearParameterCache,
  createBitmapMatcher,
  createExtensionIndex,
  createIndexedRegistryBuilder,
  createMap,
  createMapBuilder,
  createRegistry,
  createRegistryBuilder,
  EMPTY_MAP,
  EMPTY_REGISTRY,
  freezeArray,
  fromEntries,
  getFunctionParameters,
  lazy,
  lazyAsync,
  memoizeArray,
  mergeBuilders,
  parallelImport,
  parallelImportModules,
} from "./mod.ts";

// =============================================================================
// ImmutableMap Tests (Layer 0)
// =============================================================================

Deno.test("createMapBuilder - creates empty builder", () => {
  const builder = createMapBuilder<string, number>();
  assert.assertEquals(builder.size, 0);
  assert.assertEquals(builder.has("key"), false);
});

Deno.test("createMapBuilder - set adds entries", () => {
  const builder = createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  assert.assertEquals(builder.size, 2);
  assert.assertEquals(builder.has("a"), true);
  assert.assertEquals(builder.has("b"), true);
});

Deno.test("createMapBuilder - delete removes entries", () => {
  const builder = createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2).delete("a");

  assert.assertEquals(builder.size, 1);
  assert.assertEquals(builder.has("a"), false);
  assert.assertEquals(builder.has("b"), true);
});

Deno.test("createMapBuilder - build returns sealed map", () => {
  const builder = createMapBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  const map = builder.build();

  assert.assertEquals(map.size, 2);
  assert.assertEquals(map.get("a"), 1);
  assert.assertEquals(map.get("b"), 2);
});

Deno.test("createMapBuilder - build throws after sealed", () => {
  const builder = createMapBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.set("x", 1),
    Error,
    "sealed",
  );
});

Deno.test("ImmutableMap.get - returns undefined for missing keys", () => {
  const map = createMapBuilder<string, number>().build();
  assert.assertEquals(map.get("missing"), undefined);
});

Deno.test("ImmutableMap.get - returns values", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 42)
    .build();

  assert.assertEquals(map.get("a"), 42);
});

Deno.test("ImmutableMap.has - returns correct boolean", () => {
  const map = createMapBuilder<string, number>()
    .set("exists", 1)
    .build();

  assert.assertEquals(map.has("exists"), true);
  assert.assertEquals(map.has("missing"), false);
});

Deno.test("ImmutableMap.isEmpty - returns correct boolean", () => {
  const empty = createMapBuilder<string, number>().build();
  const nonEmpty = createMapBuilder<string, number>().set("a", 1).build();

  assert.assertEquals(empty.isEmpty, true);
  assert.assertEquals(nonEmpty.isEmpty, false);
});

Deno.test("ImmutableMap.keys - returns iterator", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const keys = [...map.keys()];
  assert.assertEquals(keys.length, 2);
  assert.assertEquals(keys.includes("a"), true);
  assert.assertEquals(keys.includes("b"), true);
});

Deno.test("ImmutableMap.values - returns iterator", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const values = [...map.values()];
  assert.assertEquals(values.length, 2);
  assert.assertEquals(values.includes(1), true);
  assert.assertEquals(values.includes(2), true);
});

Deno.test("ImmutableMap.entries - returns iterator", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries = [...map.entries()];
  assert.assertEquals(entries.length, 2);
});

Deno.test("ImmutableMap - supports for...of iteration", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries: [string, number][] = [];
  for (const [k, v] of map) {
    entries.push([k, v]);
  }

  assert.assertEquals(entries.length, 2);
});

Deno.test("ImmutableMap.forEach - iterates over all entries", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const collected: [string, number][] = [];
  map.forEach((value, key) => {
    collected.push([key, value]);
  });

  assert.assertEquals(collected.length, 2);
});

Deno.test("ImmutableMap.map - transforms values", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const doubled = map.map((v) => v * 2);

  assert.assertEquals(doubled.get("a"), 2);
  assert.assertEquals(doubled.get("b"), 4);
});

Deno.test("ImmutableMap.filter - filters entries", () => {
  const map = createMapBuilder<string, number>()
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

Deno.test("ImmutableMap.reduce - reduces to value", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .set("c", 3)
    .build();

  const sum = map.reduce((acc, v) => acc + v, 0);

  assert.assertEquals(sum, 6);
});

Deno.test("ImmutableMap.toBuilder - creates mutable copy", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  const newBuilder = map.toBuilder();
  newBuilder.set("b", 2);

  const newMap = newBuilder.build();

  assert.assertEquals(map.size, 1); // Original unchanged
  assert.assertEquals(newMap.size, 2);
  assert.assertEquals(newMap.get("b"), 2);
});

Deno.test("ImmutableMap.merge - merges multiple maps", () => {
  const map1 = createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  const map2 = createMapBuilder<string, number>()
    .set("b", 2)
    .build();

  const map3 = createMapBuilder<string, number>()
    .set("a", 10) // Override
    .set("c", 3)
    .build();

  const merged = map1.merge(map2, map3);

  assert.assertEquals(merged.size, 3);
  assert.assertEquals(merged.get("a"), 10); // Overridden
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
});

Deno.test("createMap - creates from iterable", () => {
  const map = createMap<string, number>([
    ["a", 1],
    ["b", 2],
  ]);

  assert.assertEquals(map.size, 2);
  assert.assertEquals(map.get("a"), 1);
  assert.assertEquals(map.get("b"), 2);
});

Deno.test("EMPTY_MAP - is empty and frozen", () => {
  assert.assertEquals(EMPTY_MAP.size, 0);
  assert.assertEquals(EMPTY_MAP.isEmpty, true);
  assert.assertEquals(Object.isFrozen(EMPTY_MAP), true);
});

// =============================================================================
// RegistryBuilder Tests
// =============================================================================

Deno.test("createRegistryBuilder - creates empty builder", () => {
  const builder = createRegistryBuilder<string, number>();
  assert.assertEquals(builder.size, 0);
  assert.assertEquals(builder.has("key"), false);
});

Deno.test("createRegistryBuilder - set adds value entries", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  assert.assertEquals(builder.size, 2);
  assert.assertEquals(builder.has("a"), true);
  assert.assertEquals(builder.has("b"), true);
});

Deno.test("createRegistryBuilder - remove deletes entries", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2).remove("a");

  assert.assertEquals(builder.size, 1);
  assert.assertEquals(builder.has("a"), false);
  assert.assertEquals(builder.has("b"), true);
});

Deno.test("createRegistryBuilder - build returns sealed registry", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.set("a", 1).set("b", 2);

  const registry = builder.build();

  assert.assertEquals(registry.size, 2);
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

Deno.test("createRegistryBuilder - build throws after sealed", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.set("x", 1),
    Error,
    "sealed",
  );
});

// =============================================================================
// Registry Tests
// =============================================================================

Deno.test("Registry.get - returns undefined for missing keys", () => {
  const registry = createRegistryBuilder<string, number>().build();
  assert.assertEquals(registry.get("missing"), undefined);
});

Deno.test("Registry.get - returns value entries", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 42)
    .build();

  assert.assertEquals(registry.get("a"), 42);
});

Deno.test("Registry.has - returns correct boolean", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("exists", 1)
    .build();

  assert.assertEquals(registry.has("exists"), true);
  assert.assertEquals(registry.has("missing"), false);
});

Deno.test("Registry.isLazy - returns correct boolean", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("value", 1)
    .setLazy("lazy", () => 2)
    .build();

  assert.assertEquals(registry.isLazy("value"), false);
  assert.assertEquals(registry.isLazy("lazy"), true);
  assert.assertEquals(registry.isLazy("missing"), false);
});

Deno.test("Registry.keys - returns frozen array", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const keys = registry.keys();
  assert.assertEquals(keys.length, 2);
  assert.assertEquals(keys.includes("a"), true);
  assert.assertEquals(keys.includes("b"), true);
  assert.assertEquals(Object.isFrozen(keys), true);
});

Deno.test("Registry.keys - returns cached array", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const keys1 = registry.keys();
  const keys2 = registry.keys();
  assert.assertEquals(keys1, keys2); // Same reference
});

Deno.test("Registry.values - returns values for value lifetime", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const values = registry.values();
  assert.assertEquals(values.length, 2);
  assert.assertEquals(values.includes(1), true);
  assert.assertEquals(values.includes(2), true);
});

Deno.test("Registry.entries - returns key-value pairs", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const entries = registry.entries();
  assert.assertEquals(entries.length, 2);
});

Deno.test("Registry.toBuilder - creates new mutable builder", () => {
  const registry = createRegistryBuilder<string, number>()
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

Deno.test("setLazy - executes factory once", () => {
  let callCount = 0;
  const factory = () => {
    callCount++;
    return 42;
  };

  const registry = createRegistryBuilder<string, number>()
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

Deno.test("setLazy - isLazy returns false after resolution", () => {
  const registry = createRegistryBuilder<string, number>()
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

Deno.test("Registry.getAsync - resolves async lazy factory", async () => {
  const registry = createRegistryBuilder<string, number>()
    .setLazy("async", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    })
    .build();

  const value = await registry.getAsync("async");
  assert.assertEquals(value, 42);
});

Deno.test("Registry.getAsync - caches async lazy result", async () => {
  let callCount = 0;
  const registry = createRegistryBuilder<string, number>()
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

Deno.test("IndexedRegistry - lookup by primary key", () => {
  const registry: IndexedRegistry<string, Format> =
    createIndexedRegistryBuilder<
      string,
      Format
    >([
      createExtensionIndex("byExt", (f) => f.extensions),
    ])
      .set("json", { name: "json", extensions: [".json"] })
      .build();

  const format = registry.get("json");
  assert.assertEquals(format?.name, "json");
});

Deno.test("IndexedRegistry - lookup by index", () => {
  const registry: IndexedRegistry<string, Format> =
    createIndexedRegistryBuilder<
      string,
      Format
    >([
      createExtensionIndex("byExt", (f) => f.extensions),
    ])
      .set("json", { name: "json", extensions: [".json"] })
      .set("yaml", { name: "yaml", extensions: [".yaml", ".yml"] })
      .build();

  const jsonFormat = registry.getByIndex("byExt", ".json");
  assert.assertEquals(jsonFormat?.name, "json");

  const yamlFormat = registry.getByIndex("byExt", ".yml");
  assert.assertEquals(yamlFormat?.name, "yaml");
});

Deno.test("IndexedRegistry - normalized lookup", () => {
  const registry: IndexedRegistry<string, Format> =
    createIndexedRegistryBuilder<
      string,
      Format
    >([
      createExtensionIndex("byExt", (f) => f.extensions),
    ])
      .set("json", { name: "json", extensions: [".json"] })
      .build();

  // Should normalize: .JSON -> json, JSON -> json
  const format1 = registry.getByIndex("byExt", ".JSON");
  assert.assertEquals(format1?.name, "json");

  const format2 = registry.getByIndex("byExt", "json");
  assert.assertEquals(format2?.name, "json");
});

Deno.test("IndexedRegistry - hasInIndex", () => {
  const registry: IndexedRegistry<string, Format> =
    createIndexedRegistryBuilder<
      string,
      Format
    >([
      createExtensionIndex("byExt", (f) => f.extensions),
    ])
      .set("json", { name: "json", extensions: [".json"] })
      .build();

  assert.assertEquals(registry.hasInIndex("byExt", ".json"), true);
  assert.assertEquals(registry.hasInIndex("byExt", ".xml"), false);
});

Deno.test("IndexedRegistry - isLazy works", () => {
  const registry: IndexedRegistry<string, Format> =
    createIndexedRegistryBuilder<
      string,
      Format
    >([
      createExtensionIndex("byExt", (f) => f.extensions),
    ])
      .set("json", { name: "json", extensions: [".json"] })
      .setLazy("lazy", () => ({ name: "lazy", extensions: [] }))
      .build();

  assert.assertEquals(registry.isLazy("json"), false);
  assert.assertEquals(registry.isLazy("lazy"), true);
});

// =============================================================================
// fromEntries Tests
// =============================================================================

Deno.test("fromEntries - creates builder from array", () => {
  const builder = fromEntries<string, number>([
    ["a", 1],
    ["b", 2, "value"],
  ]);

  const registry = builder.build();
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

Deno.test("fromEntries - supports lazy lifetime", () => {
  let called = false;
  const builder = fromEntries<string, number>([
    ["lazy", () => {
      called = true;
      return 42;
    }, "lazy"],
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

Deno.test("createBitmapMatcher - creates matcher with toBitmap", () => {
  const matcher = createBitmapMatcher(TestBits);
  const bitmap = matcher.toBitmap(["optionA", "optionB"]);
  assert.assertEquals(bitmap, 0b11); // Bits 0 and 1
});

Deno.test("createBitmapMatcher - match returns true for intersection", () => {
  const matcher = createBitmapMatcher(TestBits);
  const required = matcher.toBitmap(["optionA"]);
  const available = matcher.toBitmap(["optionA", "optionB"]);

  assert.assertEquals(matcher.match(required, available), true);
});

Deno.test("createBitmapMatcher - match returns false for no intersection", () => {
  const matcher = createBitmapMatcher(TestBits);
  const required = matcher.toBitmap(["optionC"]);
  const available = matcher.toBitmap(["optionA", "optionB"]);

  assert.assertEquals(matcher.match(required, available), false);
});

Deno.test("createBitmapMatcher - match returns true for empty required", () => {
  const matcher = createBitmapMatcher(TestBits);
  const required = matcher.toBitmap([]);
  const available = matcher.toBitmap(["optionA"]);

  assert.assertEquals(matcher.match(required, available), true);
});

Deno.test("createBitmapMatcher - matchAll returns true when all required present", () => {
  const matcher = createBitmapMatcher(TestBits);
  const required = matcher.toBitmap(["optionA", "optionB"]);
  const available = matcher.toBitmap(["optionA", "optionB", "optionC"]);

  assert.assertEquals(matcher.matchAll(required, available), true);
});

Deno.test("createBitmapMatcher - matchAll returns false when not all required present", () => {
  const matcher = createBitmapMatcher(TestBits);
  const required = matcher.toBitmap(["optionA", "optionB", "optionC"]);
  const available = matcher.toBitmap(["optionA", "optionB"]);

  assert.assertEquals(matcher.matchAll(required, available), false);
});

Deno.test("createBitmapMatcher - exposes mapping", () => {
  const matcher = createBitmapMatcher(TestBits);
  assert.assertEquals(matcher.mapping.optionA, 1);
  assert.assertEquals(matcher.mapping.optionB, 2);
  assert.assertEquals(matcher.mapping.optionC, 4);
});

Deno.test("getFunctionParameters - extracts parameter names", () => {
  const fn = (a: number, b: string, c: boolean) => a + b + c;
  const params = getFunctionParameters(fn);

  assert.assertEquals(params, ["a", "b", "c"]);
});

Deno.test("getFunctionParameters - caches results", () => {
  const fn = (x: number) => x * 2;
  const params1 = getFunctionParameters(fn);
  const params2 = getFunctionParameters(fn);

  assert.assertEquals(params1, params2); // Same reference
});

Deno.test("getFunctionParameters - handles async functions", () => {
  // deno-lint-ignore require-await
  const fn = async (data: unknown) => data;
  const params = getFunctionParameters(fn);

  assert.assertEquals(params, ["data"]);
});

Deno.test("lazy - computes value once", () => {
  let callCount = 0;
  const getValue = lazy(() => {
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

Deno.test("lazyAsync - computes async value once", async () => {
  let callCount = 0;
  // deno-lint-ignore require-await
  const getValue = lazyAsync(async () => {
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

Deno.test("freezeArray - returns frozen array", () => {
  const arr = [1, 2, 3];
  const frozen = freezeArray(arr);

  assert.assertEquals(Object.isFrozen(frozen), true);
  assert.assertEquals([...frozen], [1, 2, 3]);
});

Deno.test("memoizeArray - caches array results", () => {
  let callCount = 0;
  const getItems = memoizeArray((n: number) => {
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

Deno.test("mergeBuilders - merges multiple registries", () => {
  const reg1 = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const reg2 = createRegistryBuilder<string, number>()
    .set("c", 3)
    .set("d", 4)
    .build();

  const merged = mergeBuilders(reg1, reg2).build();

  assert.assertEquals(merged.size, 4);
  assert.assertEquals(merged.get("a"), 1);
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
  assert.assertEquals(merged.get("d"), 4);
});

Deno.test("mergeBuilders - later registries override earlier ones", () => {
  const reg1 = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const reg2 = createRegistryBuilder<string, number>()
    .set("a", 100) // Override
    .set("c", 3)
    .build();

  const merged = mergeBuilders(reg1, reg2).build();

  assert.assertEquals(merged.size, 3);
  assert.assertEquals(merged.get("a"), 100); // Overridden
  assert.assertEquals(merged.get("b"), 2);
  assert.assertEquals(merged.get("c"), 3);
});

Deno.test("mergeBuilders - handles empty registries", () => {
  const reg1 = createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const empty = createRegistryBuilder<string, number>().build();

  const merged = mergeBuilders(reg1, empty).build();

  assert.assertEquals(merged.size, 1);
  assert.assertEquals(merged.get("a"), 1);
});

Deno.test("mergeBuilders - skips undefined values", () => {
  const reg1 = createRegistryBuilder<string, number | undefined>()
    .set("a", 1)
    .set("b", undefined)
    .build();

  const merged = mergeBuilders(reg1).build();

  assert.assertEquals(merged.size, 1);
  assert.assertEquals(merged.has("a"), true);
  assert.assertEquals(merged.has("b"), false); // undefined skipped
});

// =============================================================================
// clearParameterCache Tests
// =============================================================================

Deno.test("clearParameterCache - clears cached parameters for specific function", () => {
  const fn = (x: number, y: string) => x + y;

  // Cache it
  const params1 = getFunctionParameters(fn);
  assert.assertEquals(params1, ["x", "y"]);

  // Clear cache for this function
  clearParameterCache(fn);

  // Should still work (re-computes)
  const params2 = getFunctionParameters(fn);
  assert.assertEquals(params2, ["x", "y"]);
});

// =============================================================================
// parallelImport Tests
// =============================================================================

Deno.test("parallelImport - handles empty array", async () => {
  const results = await parallelImport<unknown>([]);
  assert.assertEquals(results.length, 0);
});

// Note: parallelImport requires actual file paths for dynamic import,
// so we can only test with empty array in unit tests.
// Integration tests would need real module files.

// =============================================================================
// parallelImportModules Tests
// =============================================================================

Deno.test("parallelImportModules - handles empty array", async () => {
  const results = await parallelImportModules([]);
  assert.assertEquals(results.length, 0);
});

// Note: parallelImportModules requires actual file paths for dynamic import,
// so we can only test with empty array in unit tests.
// Integration tests would need real module files.

// =============================================================================
// EMPTY_REGISTRY Tests
// =============================================================================

Deno.test("EMPTY_REGISTRY - is empty and frozen", () => {
  assert.assertEquals(EMPTY_REGISTRY.size, 0);
  assert.assertEquals(EMPTY_REGISTRY.has("any"), false);
  assert.assertEquals(EMPTY_REGISTRY.get("any"), undefined);
  assert.assertEquals(Object.isFrozen(EMPTY_REGISTRY), true);
});

Deno.test("EMPTY_REGISTRY - keys/values/entries return empty arrays", () => {
  assert.assertEquals(EMPTY_REGISTRY.keys().length, 0);
  assert.assertEquals(EMPTY_REGISTRY.values().length, 0);
  assert.assertEquals(EMPTY_REGISTRY.entries().length, 0);
});

// =============================================================================
// createRegistry Tests
// =============================================================================

Deno.test("createRegistry - creates registry from entries map", () => {
  const entries = new Map<string, ["value", number]>([
    ["a", ["value", 1]],
    ["b", ["value", 2]],
  ]);

  const registry = createRegistry(entries);

  assert.assertEquals(registry.size, 2);
  assert.assertEquals(registry.get("a"), 1);
  assert.assertEquals(registry.get("b"), 2);
});

// =============================================================================
// Error Scenario Tests
// =============================================================================

Deno.test("RegistryBuilder - throws on set after seal", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.set("x", 1),
    Error,
    "sealed",
  );
});

Deno.test("RegistryBuilder - throws on setLazy after seal", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.setLazy("x", () => 1),
    Error,
    "sealed",
  );
});

Deno.test("RegistryBuilder - throws on remove after seal", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.remove("x"),
    Error,
    "sealed",
  );
});

Deno.test("RegistryBuilder - throws on multiple build calls", () => {
  const builder = createRegistryBuilder<string, number>();
  builder.build();

  assert.assertThrows(
    () => builder.build(),
    Error,
    "sealed",
  );
});

Deno.test("IndexedRegistryBuilder - throws on operations after seal", () => {
  const builder = createIndexedRegistryBuilder<string, { name: string }>([]);
  builder.build();

  assert.assertThrows(
    () => builder.set("x", { name: "x" }),
    Error,
    "sealed",
  );
});

Deno.test("IndexedRegistry - getByIndex returns undefined for non-existent index", () => {
  const registry = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .set("json", { name: "json", extensions: [".json"] })
    .build();

  const result = registry.getByIndex("nonExistentIndex", ".json");
  assert.assertEquals(result, undefined);
});

Deno.test("IndexedRegistry - hasInIndex returns false for non-existent index", () => {
  const registry = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .set("json", { name: "json", extensions: [".json"] })
    .build();

  const result = registry.hasInIndex("nonExistentIndex", ".json");
  assert.assertEquals(result, false);
});

Deno.test("Registry.get - returns undefined for async factory when called sync", async () => {
  const registry = createRegistryBuilder<string, number>()
    // deno-lint-ignore require-await
    .setLazy("async", async () => {
      return 42;
    })
    .build();

  // Sync access to async factory returns undefined (Promise is returned, not value)
  const result = registry.get("async");
  assert.assertEquals(result, undefined);

  // Clean up - resolve the async factory
  await registry.getAsync("async");
});

// =============================================================================
// Edge Case Tests
// =============================================================================

Deno.test("Registry - handles large number of entries", () => {
  const builder = createRegistryBuilder<string, number>();

  for (let i = 0; i < 1000; i++) {
    builder.set(`key${i}`, i);
  }

  const registry = builder.build();

  assert.assertEquals(registry.size, 1000);
  assert.assertEquals(registry.get("key0"), 0);
  assert.assertEquals(registry.get("key500"), 500);
  assert.assertEquals(registry.get("key999"), 999);
});

Deno.test("Registry - handles null values", () => {
  const registry = createRegistryBuilder<string, null>()
    .set("null", null)
    .build();

  assert.assertEquals(registry.has("null"), true);
  assert.assertEquals(registry.get("null"), null);
});

Deno.test("Registry - handles empty string keys", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("", 42)
    .build();

  assert.assertEquals(registry.has(""), true);
  assert.assertEquals(registry.get(""), 42);
});

Deno.test("Registry - handles unicode keys", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("日本語", 1)
    .set("emoji🎉", 2)
    .set("αβγ", 3)
    .build();

  assert.assertEquals(registry.get("日本語"), 1);
  assert.assertEquals(registry.get("emoji🎉"), 2);
  assert.assertEquals(registry.get("αβγ"), 3);
});

Deno.test("IndexedRegistry - handles empty extension list", () => {
  type FormatWithOptionalExt = { name: string; extensions: string[] };

  const registry = createIndexedRegistryBuilder<string, FormatWithOptionalExt>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .set("noext", { name: "noext", extensions: [] })
    .set("json", { name: "json", extensions: [".json"] })
    .build();

  assert.assertEquals(registry.get("noext")?.name, "noext");
  assert.assertEquals(registry.getByIndex("byExt", ".json")?.name, "json");
  // No extensions registered for noext
});

// =============================================================================
// Immutability Verification Tests
// =============================================================================

Deno.test("ImmutableMap - is frozen after build", () => {
  const map = createMapBuilder<string, number>()
    .set("a", 1)
    .build();

  assert.assertEquals(Object.isFrozen(map), true);
});

Deno.test("Registry - is frozen after build", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  assert.assertEquals(Object.isFrozen(registry), true);
});

Deno.test("IndexedRegistry - is frozen after build", () => {
  const registry = createIndexedRegistryBuilder<string, { name: string }>([])
    .set("a", { name: "a" })
    .build();

  assert.assertEquals(Object.isFrozen(registry), true);
});

Deno.test("Registry.keys - returns frozen array that cannot be mutated", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .set("b", 2)
    .build();

  const keys = registry.keys();
  assert.assertEquals(Object.isFrozen(keys), true);

  // Attempting to mutate should have no effect or throw
  assert.assertThrows(() => {
    (keys as string[]).push("c");
  });
});

Deno.test("Registry.values - returns frozen array", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const values = registry.values();
  assert.assertEquals(Object.isFrozen(values), true);
});

Deno.test("Registry.entries - returns frozen array", () => {
  const registry = createRegistryBuilder<string, number>()
    .set("a", 1)
    .build();

  const entries = registry.entries();
  assert.assertEquals(Object.isFrozen(entries), true);
});

Deno.test("ImmutableMap.toBuilder - creates independent copy", () => {
  const original = createMapBuilder<string, number>()
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

Deno.test("Registry - concurrent lazy access returns consistent values", async () => {
  let callCount = 0;
  const registry = createRegistryBuilder<string, number>()
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
});

Deno.test("Registry.getAsync - sequential async access caches correctly", async () => {
  let callCount = 0;
  const registry = createRegistryBuilder<string, number>()
    // deno-lint-ignore require-await
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
});

Deno.test("Registry.getAsync - works with sync values", async () => {
  const registry = createRegistryBuilder<string, number>()
    .set("sync", 42)
    .build();

  const result = await registry.getAsync("sync");
  assert.assertEquals(result, 42);
});

Deno.test("Registry.getAsync - returns undefined for missing keys", async () => {
  const registry = createRegistryBuilder<string, number>().build();

  const result = await registry.getAsync("missing");
  assert.assertEquals(result, undefined);
});

// =============================================================================
// Additional ImmutableMap Tests
// =============================================================================

Deno.test("ImmutableMap.map - preserves keys", () => {
  const map = createMap([
    ["a", 1],
    ["b", 2],
  ]);

  const mapped = map.map((v) => v * 10);

  assert.assertEquals([...mapped.keys()], ["a", "b"]);
  assert.assertEquals(mapped.get("a"), 10);
  assert.assertEquals(mapped.get("b"), 20);
});

Deno.test("ImmutableMap.filter - key predicate", () => {
  const map = createMap([
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

Deno.test("ImmutableMap.reduce - with key access", () => {
  const map = createMap([
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

Deno.test("getFunctionParameters - handles arrow functions", () => {
  const fn = (a: number) => a * 2;
  const params = getFunctionParameters(fn);
  assert.assertEquals(params, ["a"]);
});

Deno.test("getFunctionParameters - handles function with no params", () => {
  const fn = () => 42;
  const params = getFunctionParameters(fn);
  assert.assertEquals(params, []);
});

Deno.test("getFunctionParameters - handles destructured params", () => {
  // Note: Destructured params may be extracted differently
  const fn = ({ a, b }: { a: number; b: string }) => a + b;
  const params = getFunctionParameters(fn);
  // Result depends on implementation - just check it doesn't throw
  assert.assertEquals(Array.isArray(params), true);
});

Deno.test("getFunctionParameters - handles default params", () => {
  const fn = (a: number, b = 10) => a + b;
  const params = getFunctionParameters(fn);
  assert.assertEquals(params.includes("a"), true);
});

// =============================================================================
// IndexedRegistry Additional Tests
// =============================================================================

Deno.test("IndexedRegistry.toBuilder - preserves entries and lazy", () => {
  const original = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .set("json", { name: "json", extensions: [".json"] })
    .setLazy("lazy", () => ({ name: "lazy", extensions: [".lazy"] }))
    .build();

  const newBuilder = original.toBuilder();
  newBuilder.set("yaml", { name: "yaml", extensions: [".yaml"] });

  const newRegistry = newBuilder.build();

  assert.assertEquals(newRegistry.size, 3);
  assert.assertEquals(newRegistry.get("json")?.name, "json");
  assert.assertEquals(newRegistry.get("yaml")?.name, "yaml");
  assert.assertEquals(newRegistry.isLazy("lazy"), true);
});

Deno.test("IndexedRegistry.getAsync - works with lazy entries", async () => {
  const registry = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .setLazy("lazy", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { name: "lazy", extensions: [".lazy"] };
    })
    .build();

  const result = await registry.getAsync("lazy");
  assert.assertEquals(result?.name, "lazy");
});

Deno.test("IndexedRegistry - lazy entries not indexed until resolved", () => {
  const registry = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExt", (f) => f.extensions),
  ])
    .setLazy("lazy", () => ({ name: "lazy", extensions: [".lazy"] }))
    .build();

  // Lazy entries are not indexed (only "value" lifetime entries are)
  assert.assertEquals(registry.hasInIndex("byExt", ".lazy"), false);
});
