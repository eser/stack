// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { createRegistryBuilder } from "./builder.ts";

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

// =============================================================================
// Helper: Manual Lazy Map (for comparison)
// =============================================================================

type LazyEntry<V> = { type: "value"; value: V } | {
  type: "lazy";
  factory: () => V;
  cached?: V;
};

function createManualLazyMap<V>(
  entries: Array<[string, V | (() => V), "value" | "lazy"]>,
): { get: (key: string) => V | undefined; has: (key: string) => boolean } {
  const map = new Map<string, LazyEntry<V>>();
  for (const [key, valueOrFactory, type] of entries) {
    if (type === "value") {
      map.set(key, { type: "value", value: valueOrFactory as V });
    } else {
      map.set(key, { type: "lazy", factory: valueOrFactory as () => V });
    }
  }
  return {
    get: (key: string) => {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.type === "value") return entry.value;
      if (entry.cached !== undefined) return entry.cached;
      entry.cached = entry.factory();
      return entry.cached;
    },
    has: (key: string) => map.has(key),
  };
}

// =============================================================================
// Pre-built structures for read benchmarks
// =============================================================================

// Registry with values only
const registrySmall = (() => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of smallEntries) builder.set(k, v);
  return builder.build();
})();

const registryMedium = (() => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) builder.set(k, v);
  return builder.build();
})();

const registryLarge = (() => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of largeEntries) builder.set(k, v);
  return builder.build();
})();

// Registry with lazy entries
const registryLazyMedium = (() => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) {
    builder.setLazy(k, () => v);
  }
  return builder.build();
})();

// Native Map equivalents
const nativeMapMedium = new Map(mediumEntries);

// Manual lazy map equivalent
const manualLazyMedium = createManualLazyMap<number>(
  mediumEntries.map(([k, v]) => [k, () => v, "lazy"]),
);

// =============================================================================
// Creation Benchmarks
// =============================================================================

Deno.bench("Registry.create (10 entries)", {
  group: "create-small",
  baseline: true,
}, () => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of smallEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (10 entries)", { group: "create-small" }, () => {
  new Map(smallEntries);
});

Deno.bench("Registry.create (100 entries)", {
  group: "create-medium",
  baseline: true,
}, () => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (100 entries)", { group: "create-medium" }, () => {
  new Map(mediumEntries);
});

Deno.bench("Registry.create (1000 entries)", {
  group: "create-large",
  baseline: true,
}, () => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of largeEntries) builder.set(k, v);
  builder.build();
});

Deno.bench("Map.create (1000 entries)", { group: "create-large" }, () => {
  new Map(largeEntries);
});

// =============================================================================
// Create with Lazy Entries
// =============================================================================

Deno.bench("Registry.createLazy (100 entries)", {
  group: "create-lazy",
  baseline: true,
}, () => {
  const builder = createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) {
    builder.setLazy(k, () => v);
  }
  builder.build();
});

Deno.bench(
  "ManualLazyMap.create (100 entries)",
  { group: "create-lazy" },
  () => {
    createManualLazyMap<number>(
      mediumEntries.map(([k, v]) => [k, () => v, "lazy"]),
    );
  },
);

// =============================================================================
// Get Benchmarks (Value Entries)
// =============================================================================

Deno.bench(
  "Registry.get (10 entries)",
  { group: "get-small", baseline: true },
  () => {
    registrySmall.get("key5");
  },
);

Deno.bench("Map.get (10 entries)", { group: "get-small" }, () => {
  nativeMapMedium.get("key5");
});

Deno.bench("Registry.get (100 entries)", {
  group: "get-medium",
  baseline: true,
}, () => {
  registryMedium.get("key50");
});

Deno.bench("Map.get (100 entries)", { group: "get-medium" }, () => {
  nativeMapMedium.get("key50");
});

Deno.bench("Registry.get (1000 entries)", {
  group: "get-large",
  baseline: true,
}, () => {
  registryLarge.get("key500");
});

Deno.bench("Map.get (1000 entries)", { group: "get-large" }, () => {
  new Map(largeEntries).get("key500");
});

// =============================================================================
// Get Benchmarks (Lazy Entries - First Access)
// =============================================================================

Deno.bench(
  "Registry.get lazy first access",
  { group: "lazy-first-access", baseline: true },
  () => {
    // Create fresh registry for each iteration to measure first access
    const builder = createRegistryBuilder<string, number>();
    builder.setLazy("lazy", () => 42);
    const registry = builder.build();
    registry.get("lazy");
  },
);

Deno.bench("ManualLazyMap.get lazy first access", {
  group: "lazy-first-access",
}, () => {
  const map = createManualLazyMap<number>([["lazy", () => 42, "lazy"]]);
  map.get("lazy");
});

// =============================================================================
// Get Benchmarks (Lazy Entries - Cached Access)
// =============================================================================

// Pre-access to cache the values
registryLazyMedium.get("key0");
manualLazyMedium.get("key0");

Deno.bench(
  "Registry.get lazy cached",
  { group: "lazy-cached", baseline: true },
  () => {
    registryLazyMedium.get("key0");
  },
);

Deno.bench("ManualLazyMap.get lazy cached", { group: "lazy-cached" }, () => {
  manualLazyMedium.get("key0");
});

// =============================================================================
// Has Benchmarks
// =============================================================================

Deno.bench("Registry.has", { group: "has", baseline: true }, () => {
  registryMedium.has("key50");
});

Deno.bench("Map.has", { group: "has" }, () => {
  nativeMapMedium.has("key50");
});

// =============================================================================
// isLazy Benchmarks
// =============================================================================

Deno.bench(
  "Registry.isLazy (value entry)",
  { group: "isLazy", baseline: true },
  () => {
    registryMedium.isLazy("key50");
  },
);

Deno.bench("Registry.isLazy (lazy entry)", { group: "isLazy" }, () => {
  registryLazyMedium.isLazy("key50");
});

// =============================================================================
// Keys/Values/Entries Benchmarks
// =============================================================================

Deno.bench("Registry.keys", { group: "keys", baseline: true }, () => {
  registryMedium.keys();
});

Deno.bench("Map.keys", { group: "keys" }, () => {
  [...nativeMapMedium.keys()];
});

Deno.bench("Registry.values", { group: "values", baseline: true }, () => {
  registryMedium.values();
});

Deno.bench("Map.values", { group: "values" }, () => {
  [...nativeMapMedium.values()];
});

Deno.bench("Registry.entries", { group: "entries", baseline: true }, () => {
  registryMedium.entries();
});

Deno.bench("Map.entries", { group: "entries" }, () => {
  [...nativeMapMedium.entries()];
});

// =============================================================================
// toBuilder (Copy-on-Write) Benchmarks
// =============================================================================

Deno.bench("Registry.toBuilder.set.build", {
  group: "copy-on-write",
  baseline: true,
}, () => {
  registryMedium.toBuilder().set("newKey", 999).build();
});

Deno.bench("Map.copy-on-write", { group: "copy-on-write" }, () => {
  const newMap = new Map(nativeMapMedium);
  newMap.set("newKey", 999);
});

// =============================================================================
// Async Get Benchmarks
// =============================================================================

Deno.bench(
  "Registry.getAsync (value)",
  { group: "getAsync", baseline: true },
  async () => {
    await registryMedium.getAsync("key50");
  },
);

Deno.bench("Promise.resolve + Map.get", { group: "getAsync" }, async () => {
  await Promise.resolve(nativeMapMedium.get("key50"));
});

// Async lazy entry
const asyncLazyRegistry = (() => {
  const builder = createRegistryBuilder<string, number>();
  // deno-lint-ignore require-await
  builder.setLazy("async", async () => {
    return 42;
  });
  return builder.build();
})();

Deno.bench("Registry.getAsync (async lazy)", {
  group: "getAsync-lazy",
  baseline: true,
}, async () => {
  await asyncLazyRegistry.getAsync("async");
});

Deno.bench("Manual async factory", { group: "getAsync-lazy" }, async () => {
  // deno-lint-ignore require-await
  await (async () => 42)();
});

// =============================================================================
// Size Property Benchmarks
// =============================================================================

Deno.bench("Registry.size", { group: "size", baseline: true }, () => {
  registryMedium.size;
});

Deno.bench("Map.size", { group: "size" }, () => {
  nativeMapMedium.size;
});
