// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as builder from "./builder.ts";

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

type LazyEntry<V> =
  | { type: "value"; value: V }
  | {
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
  const registryBuilder = builder.createRegistryBuilder<string, number>();
  for (const [k, v] of smallEntries) registryBuilder.set(k, v);
  return registryBuilder.build();
})();

const registryMedium = (() => {
  const registryBuilder = builder.createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) registryBuilder.set(k, v);
  return registryBuilder.build();
})();

const registryLarge = (() => {
  const registryBuilder = builder.createRegistryBuilder<string, number>();
  for (const [k, v] of largeEntries) registryBuilder.set(k, v);
  return registryBuilder.build();
})();

// Registry with lazy entries
const registryLazyMedium = (() => {
  const registryBuilder = builder.createRegistryBuilder<string, number>();
  for (const [k, v] of mediumEntries) {
    registryBuilder.setLazy(k, () => v);
  }
  return registryBuilder.build();
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

mitata.group("create-small", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.create (10 entries)", () => {
        const registryBuilder = builder.createRegistryBuilder<string, number>();
        for (const [k, v] of smallEntries) registryBuilder.set(k, v);
        registryBuilder.build();
      })
      .baseline();
    mitata.bench("Map.create (10 entries)", () => {
      new Map(smallEntries);
    });
  });
});

mitata.group("create-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.create (100 entries)", () => {
        const registryBuilder = builder.createRegistryBuilder<string, number>();
        for (const [k, v] of mediumEntries) registryBuilder.set(k, v);
        registryBuilder.build();
      })
      .baseline();
    mitata.bench("Map.create (100 entries)", () => {
      new Map(mediumEntries);
    });
  });
});

mitata.group("create-large", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.create (1000 entries)", () => {
        const registryBuilder = builder.createRegistryBuilder<string, number>();
        for (const [k, v] of largeEntries) registryBuilder.set(k, v);
        registryBuilder.build();
      })
      .baseline();
    mitata.bench("Map.create (1000 entries)", () => {
      new Map(largeEntries);
    });
  });
});

// =============================================================================
// Create with Lazy Entries
// =============================================================================

mitata.group("create-lazy", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.createLazy (100 entries)", () => {
        const registryBuilder = builder.createRegistryBuilder<string, number>();
        for (const [k, v] of mediumEntries) {
          registryBuilder.setLazy(k, () => v);
        }
        registryBuilder.build();
      })
      .baseline();
    mitata.bench("ManualLazyMap.create (100 entries)", () => {
      createManualLazyMap<number>(
        mediumEntries.map(([k, v]) => [k, () => v, "lazy"]),
      );
    });
  });
});

// =============================================================================
// Get Benchmarks (Value Entries)
// =============================================================================

mitata.group("get-small", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.get (10 entries)", () => {
        registrySmall.get("key5");
      })
      .baseline();
    mitata.bench("Map.get (10 entries)", () => {
      nativeMapMedium.get("key5");
    });
  });
});

mitata.group("get-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.get (100 entries)", () => {
        registryMedium.get("key50");
      })
      .baseline();
    mitata.bench("Map.get (100 entries)", () => {
      nativeMapMedium.get("key50");
    });
  });
});

mitata.group("get-large", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.get (1000 entries)", () => {
        registryLarge.get("key500");
      })
      .baseline();
    mitata.bench("Map.get (1000 entries)", () => {
      new Map(largeEntries).get("key500");
    });
  });
});

// =============================================================================
// Get Benchmarks (Lazy Entries - First Access)
// =============================================================================

mitata.group("lazy-first-access", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.get lazy first access", () => {
        // Create fresh registry for each iteration to measure first access
        const registryBuilder = builder.createRegistryBuilder<string, number>();
        registryBuilder.setLazy("lazy", () => 42);
        const registry = registryBuilder.build();
        registry.get("lazy");
      })
      .baseline();
    mitata.bench("ManualLazyMap.get lazy first access", () => {
      const map = createManualLazyMap<number>([["lazy", () => 42, "lazy"]]);
      map.get("lazy");
    });
  });
});

// =============================================================================
// Get Benchmarks (Lazy Entries - Cached Access)
// =============================================================================

// Pre-access to cache the values
registryLazyMedium.get("key0");
manualLazyMedium.get("key0");

mitata.group("lazy-cached", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.get lazy cached", () => {
        registryLazyMedium.get("key0");
      })
      .baseline();
    mitata.bench("ManualLazyMap.get lazy cached", () => {
      manualLazyMedium.get("key0");
    });
  });
});

// =============================================================================
// Has Benchmarks
// =============================================================================

mitata.group("has", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.has", () => {
        registryMedium.has("key50");
      })
      .baseline();
    mitata.bench("Map.has", () => {
      nativeMapMedium.has("key50");
    });
  });
});

// =============================================================================
// isLazy Benchmarks
// =============================================================================

mitata.group("isLazy", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.isLazy (value entry)", () => {
        registryMedium.isLazy("key50");
      })
      .baseline();
    mitata.bench("Registry.isLazy (lazy entry)", () => {
      registryLazyMedium.isLazy("key50");
    });
  });
});

// =============================================================================
// Keys/Values/Entries Benchmarks
// =============================================================================

mitata.group("keys", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.keys", () => {
        registryMedium.keys();
      })
      .baseline();
    mitata.bench("Map.keys", () => {
      [...nativeMapMedium.keys()];
    });
  });
});

mitata.group("values", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.values", () => {
        registryMedium.values();
      })
      .baseline();
    mitata.bench("Map.values", () => {
      [...nativeMapMedium.values()];
    });
  });
});

mitata.group("entries", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.entries", () => {
        registryMedium.entries();
      })
      .baseline();
    mitata.bench("Map.entries", () => {
      [...nativeMapMedium.entries()];
    });
  });
});

// =============================================================================
// toBuilder (Copy-on-Write) Benchmarks
// =============================================================================

mitata.group("copy-on-write", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.toBuilder.set.build", () => {
        registryMedium.toBuilder().set("newKey", 999).build();
      })
      .baseline();
    mitata.bench("Map.copy-on-write", () => {
      const newMap = new Map(nativeMapMedium);
      newMap.set("newKey", 999);
    });
  });
});

// =============================================================================
// Async Get Benchmarks
// =============================================================================

mitata.group("getAsync", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.getAsync (value)", async () => {
        await registryMedium.getAsync("key50");
      })
      .baseline();
    mitata.bench("Promise.resolve + Map.get", async () => {
      await Promise.resolve(nativeMapMedium.get("key50"));
    });
  });
});

// Async lazy entry
const asyncLazyRegistry = (() => {
  const registryBuilder = builder.createRegistryBuilder<string, number>();
  // An async factory with nothing to await is the case this group measures.
  // oxlint-disable-next-line require-await
  registryBuilder.setLazy("async", async () => {
    return 42;
  });
  return registryBuilder.build();
})();

mitata.group("getAsync-lazy", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.getAsync (async lazy)", async () => {
        await asyncLazyRegistry.getAsync("async");
      })
      .baseline();
    mitata.bench("Manual async factory", async () => {
      // The bare async factory is the baseline for the lazy registry entry above.
      // oxlint-disable-next-line require-await
      await (async () => 42)();
    });
  });
});

// =============================================================================
// Size Property Benchmarks
// =============================================================================

mitata.group("size", () => {
  mitata.summary(() => {
    mitata
      .bench("Registry.size", () => {
        registryMedium.size;
      })
      .baseline();
    mitata.bench("Map.size", () => {
      nativeMapMedium.size;
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
