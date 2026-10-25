// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as immutableMap from "./immutable-map.ts";

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
const immutableMapSmall = immutableMap.createMap(smallEntries);
const immutableMapMedium = immutableMap.createMap(mediumEntries);
const immutableMapLarge = immutableMap.createMap(largeEntries);

const nativeMapSmall = new Map(smallEntries);
const nativeMapMedium = new Map(mediumEntries);
const nativeMapLarge = new Map(largeEntries);

const objectSmall = Object.fromEntries(smallEntries);
const objectMedium = Object.fromEntries(mediumEntries);
const objectLarge = Object.fromEntries(largeEntries);

// =============================================================================
// Creation Benchmarks
// =============================================================================

mitata.group("create-small", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.create (10 entries)", () => {
        const builder = immutableMap.createMapBuilder<string, number>();
        for (const [k, v] of smallEntries) builder.set(k, v);
        builder.build();
      })
      .baseline();
    mitata.bench("Map.create (10 entries)", () => {
      new Map(smallEntries);
    });
    mitata.bench("Object.create (10 entries)", () => {
      Object.fromEntries(smallEntries);
    });
  });
});

mitata.group("create-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.create (100 entries)", () => {
        const builder = immutableMap.createMapBuilder<string, number>();
        for (const [k, v] of mediumEntries) builder.set(k, v);
        builder.build();
      })
      .baseline();
    mitata.bench("Map.create (100 entries)", () => {
      new Map(mediumEntries);
    });
    mitata.bench("Object.create (100 entries)", () => {
      Object.fromEntries(mediumEntries);
    });
  });
});

mitata.group("create-large", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.create (1000 entries)", () => {
        const builder = immutableMap.createMapBuilder<string, number>();
        for (const [k, v] of largeEntries) builder.set(k, v);
        builder.build();
      })
      .baseline();
    mitata.bench("Map.create (1000 entries)", () => {
      new Map(largeEntries);
    });
    mitata.bench("Object.create (1000 entries)", () => {
      Object.fromEntries(largeEntries);
    });
  });
});

// =============================================================================
// Get Benchmarks
// =============================================================================

mitata.group("get-small", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.get (10 entries)", () => {
        immutableMapSmall.get("key5");
      })
      .baseline();
    mitata.bench("Map.get (10 entries)", () => {
      nativeMapSmall.get("key5");
    });
    mitata.bench("Object.get (10 entries)", () => {
      objectSmall["key5"];
    });
  });
});

mitata.group("get-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.get (100 entries)", () => {
        immutableMapMedium.get("key50");
      })
      .baseline();
    mitata.bench("Map.get (100 entries)", () => {
      nativeMapMedium.get("key50");
    });
    mitata.bench("Object.get (100 entries)", () => {
      objectMedium["key50"];
    });
  });
});

mitata.group("get-large", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.get (1000 entries)", () => {
        immutableMapLarge.get("key500");
      })
      .baseline();
    mitata.bench("Map.get (1000 entries)", () => {
      nativeMapLarge.get("key500");
    });
    mitata.bench("Object.get (1000 entries)", () => {
      objectLarge["key500"];
    });
  });
});

// =============================================================================
// Has Benchmarks
// =============================================================================

mitata.group("has", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.has", () => {
        immutableMapMedium.has("key50");
      })
      .baseline();
    mitata.bench("Map.has", () => {
      nativeMapMedium.has("key50");
    });
    mitata.bench("Object.has (in)", () => {
      "key50" in objectMedium;
    });
    mitata.bench("Object.has (hasOwnProperty)", () => {
      Object.hasOwn(objectMedium, "key50");
    });
  });
});

// =============================================================================
// Iteration Benchmarks
// =============================================================================

mitata.group("iterate", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.iterate (100 entries)", () => {
        for (const [_k, _v] of immutableMapMedium) {
          // consume
        }
      })
      .baseline();
    mitata.bench("Map.iterate (100 entries)", () => {
      for (const [_k, _v] of nativeMapMedium) {
        // consume
      }
    });
    mitata.bench("Object.iterate (100 entries)", () => {
      for (const [_k, _v] of Object.entries(objectMedium)) {
        // consume
      }
    });
  });
});

// =============================================================================
// Keys Benchmarks
// =============================================================================

mitata.group("keys", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.keys (100 entries)", () => {
        immutableMapMedium.keys();
      })
      .baseline();
    mitata.bench("Map.keys (100 entries)", () => {
      [...nativeMapMedium.keys()];
    });
    mitata.bench("Object.keys (100 entries)", () => {
      Object.keys(objectMedium);
    });
  });
});

// =============================================================================
// Values Benchmarks
// =============================================================================

mitata.group("values", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.values (100 entries)", () => {
        immutableMapMedium.values();
      })
      .baseline();
    mitata.bench("Map.values (100 entries)", () => {
      [...nativeMapMedium.values()];
    });
    mitata.bench("Object.values (100 entries)", () => {
      Object.values(objectMedium);
    });
  });
});

// =============================================================================
// Entries Benchmarks
// =============================================================================

mitata.group("entries", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.entries (100 entries)", () => {
        immutableMapMedium.entries();
      })
      .baseline();
    mitata.bench("Map.entries (100 entries)", () => {
      [...nativeMapMedium.entries()];
    });
    mitata.bench("Object.entries (100 entries)", () => {
      Object.entries(objectMedium);
    });
  });
});

// =============================================================================
// Transform (Map) Benchmarks
// =============================================================================

mitata.group("map", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.map (100 entries)", () => {
        immutableMapMedium.map((v) => v * 2);
      })
      .baseline();
    mitata.bench("Map.map (manual, 100 entries)", () => {
      const result = new Map<string, number>();
      for (const [k, v] of nativeMapMedium) {
        result.set(k, v * 2);
      }
    });
    mitata.bench("Object.map (manual, 100 entries)", () => {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(objectMedium)) {
        result[k] = v * 2;
      }
    });
  });
});

// =============================================================================
// Filter Benchmarks
// =============================================================================

mitata.group("filter", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.filter (100 entries)", () => {
        immutableMapMedium.filter((v) => v % 2 === 0);
      })
      .baseline();
    mitata.bench("Map.filter (manual, 100 entries)", () => {
      const result = new Map<string, number>();
      for (const [k, v] of nativeMapMedium) {
        if (v % 2 === 0) result.set(k, v);
      }
    });
    mitata.bench("Object.filter (manual, 100 entries)", () => {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(objectMedium)) {
        if (v % 2 === 0) result[k] = v;
      }
    });
  });
});

// =============================================================================
// Merge Benchmarks
// =============================================================================

const mergeSource1 = immutableMap.createMap<string, number>([
  ["a", 1],
  ["b", 2],
]);
const mergeSource2 = immutableMap.createMap<string, number>([
  ["c", 3],
  ["d", 4],
]);
const nativeMerge1 = new Map([
  ["a", 1],
  ["b", 2],
]);
const nativeMerge2 = new Map([
  ["c", 3],
  ["d", 4],
]);
const objectMerge1 = { a: 1, b: 2 };
const objectMerge2 = { c: 3, d: 4 };

mitata.group("merge", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.merge", () => {
        mergeSource1.merge(mergeSource2);
      })
      .baseline();
    mitata.bench("Map.merge (spread)", () => {
      new Map([...nativeMerge1, ...nativeMerge2]);
    });
    mitata.bench("Object.merge (spread)", () => {
      ({ ...objectMerge1, ...objectMerge2 });
    });
  });
});

// =============================================================================
// Copy-on-Write Benchmarks
// =============================================================================

mitata.group("copy-on-write", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.toBuilder.set.build", () => {
        immutableMapMedium.toBuilder().set("newKey", 999).build();
      })
      .baseline();
    mitata.bench("Map.copy-on-write", () => {
      const newMap = new Map(nativeMapMedium);
      newMap.set("newKey", 999);
    });
    mitata.bench("Object.copy-on-write", () => {
      ({ ...objectMedium, newKey: 999 });
    });
  });
});

// =============================================================================
// Empty Map Benchmarks
// =============================================================================

mitata.group("empty", () => {
  mitata.summary(() => {
    mitata
      .bench("ImmutableMap.EMPTY_MAP access", () => {
        immutableMap.EMPTY_MAP.size;
      })
      .baseline();
    mitata.bench("new Map() creation", () => {
      new Map().size;
    });
    mitata.bench("empty object creation", () => {
      Object.keys({}).length;
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
