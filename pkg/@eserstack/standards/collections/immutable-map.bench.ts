// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { createMap, createMapBuilder, EMPTY_MAP } from "./immutable-map.ts";

// =============================================================================
// Test Data
// =============================================================================

const SMALL_SIZE = 10;
const MEDIUM_SIZE = 100;
const LARGE_SIZE = 1000;

const smallEntries: [string, number][] = Array.from(
  { length: SMALL_SIZE },
  (_, i) => [`key${i}`, i],
);

const mediumEntries: [string, number][] = Array.from(
  { length: MEDIUM_SIZE },
  (_, i) => [`key${i}`, i],
);

const largeEntries: [string, number][] = Array.from(
  { length: LARGE_SIZE },
  (_, i) => [`key${i}`, i],
);

// Pre-built structures for read benchmarks
const immutableMapSmall = createMap(smallEntries);
const immutableMapMedium = createMap(mediumEntries);
const immutableMapLarge = createMap(largeEntries);

const nativeMapSmall = new Map(smallEntries);
const nativeMapMedium = new Map(mediumEntries);
const nativeMapLarge = new Map(largeEntries);

const objectSmall = Object.fromEntries(smallEntries);
const objectMedium = Object.fromEntries(mediumEntries);
const objectLarge = Object.fromEntries(largeEntries);

// =============================================================================
// Creation Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.create (10 entries)", {
  group: "create-small",
  baseline: true,
}, () => {
  const builder = createMapBuilder<string, number>();
  for (const [k, v] of smallEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (10 entries)", { group: "create-small" }, () => {
  new Map(smallEntries);
});

Deno.bench("Object.create (10 entries)", { group: "create-small" }, () => {
  Object.fromEntries(smallEntries);
});

Deno.bench("ImmutableMap.create (100 entries)", {
  group: "create-medium",
  baseline: true,
}, () => {
  const builder = createMapBuilder<string, number>();
  for (const [k, v] of mediumEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (100 entries)", { group: "create-medium" }, () => {
  new Map(mediumEntries);
});

Deno.bench("Object.create (100 entries)", { group: "create-medium" }, () => {
  Object.fromEntries(mediumEntries);
});

Deno.bench("ImmutableMap.create (1000 entries)", {
  group: "create-large",
  baseline: true,
}, () => {
  const builder = createMapBuilder<string, number>();
  for (const [k, v] of largeEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (1000 entries)", { group: "create-large" }, () => {
  new Map(largeEntries);
});

Deno.bench("Object.create (1000 entries)", { group: "create-large" }, () => {
  Object.fromEntries(largeEntries);
});

// =============================================================================
// Get Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.get (10 entries)", {
  group: "get-small",
  baseline: true,
}, () => {
  immutableMapSmall.get("key5");
});

Deno.bench("Map.get (10 entries)", { group: "get-small" }, () => {
  nativeMapSmall.get("key5");
});

Deno.bench("Object.get (10 entries)", { group: "get-small" }, () => {
  objectSmall["key5"];
});

Deno.bench("ImmutableMap.get (100 entries)", {
  group: "get-medium",
  baseline: true,
}, () => {
  immutableMapMedium.get("key50");
});

Deno.bench("Map.get (100 entries)", { group: "get-medium" }, () => {
  nativeMapMedium.get("key50");
});

Deno.bench("Object.get (100 entries)", { group: "get-medium" }, () => {
  objectMedium["key50"];
});

Deno.bench("ImmutableMap.get (1000 entries)", {
  group: "get-large",
  baseline: true,
}, () => {
  immutableMapLarge.get("key500");
});

Deno.bench("Map.get (1000 entries)", { group: "get-large" }, () => {
  nativeMapLarge.get("key500");
});

Deno.bench("Object.get (1000 entries)", { group: "get-large" }, () => {
  objectLarge["key500"];
});

// =============================================================================
// Has Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.has", { group: "has", baseline: true }, () => {
  immutableMapMedium.has("key50");
});

Deno.bench("Map.has", { group: "has" }, () => {
  nativeMapMedium.has("key50");
});

Deno.bench("Object.has (in)", { group: "has" }, () => {
  "key50" in objectMedium;
});

Deno.bench("Object.has (hasOwnProperty)", { group: "has" }, () => {
  Object.hasOwn(objectMedium, "key50");
});

// =============================================================================
// Iteration Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.iterate (100 entries)", {
  group: "iterate",
  baseline: true,
}, () => {
  for (const [_k, _v] of immutableMapMedium) {
    // consume
  }
});

Deno.bench("Map.iterate (100 entries)", { group: "iterate" }, () => {
  for (const [_k, _v] of nativeMapMedium) {
    // consume
  }
});

Deno.bench("Object.iterate (100 entries)", { group: "iterate" }, () => {
  for (const [_k, _v] of Object.entries(objectMedium)) {
    // consume
  }
});

// =============================================================================
// Keys Benchmarks
// =============================================================================

Deno.bench(
  "ImmutableMap.keys (100 entries)",
  { group: "keys", baseline: true },
  () => {
    immutableMapMedium.keys();
  },
);

Deno.bench("Map.keys (100 entries)", { group: "keys" }, () => {
  [...nativeMapMedium.keys()];
});

Deno.bench("Object.keys (100 entries)", { group: "keys" }, () => {
  Object.keys(objectMedium);
});

// =============================================================================
// Values Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.values (100 entries)", {
  group: "values",
  baseline: true,
}, () => {
  immutableMapMedium.values();
});

Deno.bench("Map.values (100 entries)", { group: "values" }, () => {
  [...nativeMapMedium.values()];
});

Deno.bench("Object.values (100 entries)", { group: "values" }, () => {
  Object.values(objectMedium);
});

// =============================================================================
// Entries Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.entries (100 entries)", {
  group: "entries",
  baseline: true,
}, () => {
  immutableMapMedium.entries();
});

Deno.bench("Map.entries (100 entries)", { group: "entries" }, () => {
  [...nativeMapMedium.entries()];
});

Deno.bench("Object.entries (100 entries)", { group: "entries" }, () => {
  Object.entries(objectMedium);
});

// =============================================================================
// Transform (Map) Benchmarks
// =============================================================================

Deno.bench(
  "ImmutableMap.map (100 entries)",
  { group: "map", baseline: true },
  () => {
    immutableMapMedium.map((v) => v * 2);
  },
);

Deno.bench("Map.map (manual, 100 entries)", { group: "map" }, () => {
  const result = new Map<string, number>();
  for (const [k, v] of nativeMapMedium) {
    result.set(k, v * 2);
  }
});

Deno.bench("Object.map (manual, 100 entries)", { group: "map" }, () => {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(objectMedium)) {
    result[k] = v * 2;
  }
});

// =============================================================================
// Filter Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.filter (100 entries)", {
  group: "filter",
  baseline: true,
}, () => {
  immutableMapMedium.filter((v) => v % 2 === 0);
});

Deno.bench("Map.filter (manual, 100 entries)", { group: "filter" }, () => {
  const result = new Map<string, number>();
  for (const [k, v] of nativeMapMedium) {
    if (v % 2 === 0) result.set(k, v);
  }
});

Deno.bench("Object.filter (manual, 100 entries)", { group: "filter" }, () => {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(objectMedium)) {
    if (v % 2 === 0) result[k] = v;
  }
});

// =============================================================================
// Merge Benchmarks
// =============================================================================

const mergeSource1 = createMap<string, number>([["a", 1], ["b", 2]]);
const mergeSource2 = createMap<string, number>([["c", 3], ["d", 4]]);
const nativeMerge1 = new Map([["a", 1], ["b", 2]]);
const nativeMerge2 = new Map([["c", 3], ["d", 4]]);
const objectMerge1 = { a: 1, b: 2 };
const objectMerge2 = { c: 3, d: 4 };

Deno.bench("ImmutableMap.merge", { group: "merge", baseline: true }, () => {
  mergeSource1.merge(mergeSource2);
});

Deno.bench("Map.merge (spread)", { group: "merge" }, () => {
  new Map([...nativeMerge1, ...nativeMerge2]);
});

Deno.bench("Object.merge (spread)", { group: "merge" }, () => {
  ({ ...objectMerge1, ...objectMerge2 });
});

// =============================================================================
// Copy-on-Write Benchmarks
// =============================================================================

Deno.bench("ImmutableMap.toBuilder.set.build", {
  group: "copy-on-write",
  baseline: true,
}, () => {
  immutableMapMedium.toBuilder().set("newKey", 999).build();
});

Deno.bench("Map.copy-on-write", { group: "copy-on-write" }, () => {
  const newMap = new Map(nativeMapMedium);
  newMap.set("newKey", 999);
});

Deno.bench("Object.copy-on-write", { group: "copy-on-write" }, () => {
  ({ ...objectMedium, newKey: 999 });
});

// =============================================================================
// Empty Map Benchmarks
// =============================================================================

Deno.bench(
  "ImmutableMap.EMPTY_MAP access",
  { group: "empty", baseline: true },
  () => {
    EMPTY_MAP.size;
  },
);

Deno.bench("new Map() creation", { group: "empty" }, () => {
  new Map().size;
});

Deno.bench("empty object creation", { group: "empty" }, () => {
  Object.keys({}).length;
});
