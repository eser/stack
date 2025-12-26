// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  createExtensionIndex,
  createIndexedRegistryBuilder,
} from "./indexed.ts";

// =============================================================================
// Test Data
// =============================================================================

interface Format {
  name: string;
  extensions: readonly string[];
  mimeType: string;
}

const SMALL_SIZE = 10;
const MEDIUM_SIZE = 50;
const LARGE_SIZE = 200;

const createFormats = (size: number): Format[] =>
  Array.from({ length: size }, (_, i) => ({
    name: `format${i}`,
    extensions: [`.ext${i}`, `.alt${i}`],
    mimeType: `application/x-format${i}`,
  }));

const smallFormats = createFormats(SMALL_SIZE);
const mediumFormats = createFormats(MEDIUM_SIZE);
const largeFormats = createFormats(LARGE_SIZE);

// =============================================================================
// Helper: Manual Multi-Index Map (for comparison)
// =============================================================================

function createManualIndexedMap<V extends { extensions: readonly string[] }>(
  entries: Array<[string, V]>,
): {
  get: (key: string) => V | undefined;
  getByExtension: (ext: string) => V | undefined;
  has: (key: string) => boolean;
  hasExtension: (ext: string) => boolean;
} {
  const primaryMap = new Map<string, V>();
  const extensionIndex = new Map<string, string>();

  for (const [key, value] of entries) {
    primaryMap.set(key, value);
    for (const ext of value.extensions) {
      const normalized = ext.toLowerCase().replace(/^\./, "");
      extensionIndex.set(normalized, key);
    }
  }

  return {
    get: (key: string) => primaryMap.get(key),
    getByExtension: (ext: string) => {
      const normalized = ext.toLowerCase().replace(/^\./, "");
      const primaryKey = extensionIndex.get(normalized);
      return primaryKey ? primaryMap.get(primaryKey) : undefined;
    },
    has: (key: string) => primaryMap.has(key),
    hasExtension: (ext: string) => {
      const normalized = ext.toLowerCase().replace(/^\./, "");
      return extensionIndex.has(normalized);
    },
  };
}

// =============================================================================
// Pre-built structures for read benchmarks
// =============================================================================

const indexedRegistrySmall = (() => {
  const builder = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExtension", (f) => f.extensions),
  ]);
  for (const f of smallFormats) builder.set(f.name, f);
  return builder.build();
})();

const indexedRegistryMedium = (() => {
  const builder = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExtension", (f) => f.extensions),
  ]);
  for (const f of mediumFormats) builder.set(f.name, f);
  return builder.build();
})();

const indexedRegistryLarge = (() => {
  const builder = createIndexedRegistryBuilder<string, Format>([
    createExtensionIndex("byExtension", (f) => f.extensions),
  ]);
  for (const f of largeFormats) builder.set(f.name, f);
  return builder.build();
})();

const manualIndexedSmall = createManualIndexedMap(
  smallFormats.map((f) => [f.name, f] as [string, Format]),
);

const manualIndexedMedium = createManualIndexedMap(
  mediumFormats.map((f) => [f.name, f] as [string, Format]),
);

const manualIndexedLarge = createManualIndexedMap(
  largeFormats.map((f) => [f.name, f] as [string, Format]),
);

// =============================================================================
// Creation Benchmarks
// =============================================================================

Deno.bench(
  "IndexedRegistry.create (10 entries)",
  { group: "create-small", baseline: true },
  () => {
    const builder = createIndexedRegistryBuilder<string, Format>([
      createExtensionIndex("byExtension", (f) => f.extensions),
    ]);
    for (const f of smallFormats) builder.set(f.name, f);
    builder.build();
  },
);

Deno.bench(
  "ManualIndexedMap.create (10 entries)",
  { group: "create-small" },
  () => {
    createManualIndexedMap(
      smallFormats.map((f) => [f.name, f] as [string, Format]),
    );
  },
);

Deno.bench(
  "IndexedRegistry.create (50 entries)",
  { group: "create-medium", baseline: true },
  () => {
    const builder = createIndexedRegistryBuilder<string, Format>([
      createExtensionIndex("byExtension", (f) => f.extensions),
    ]);
    for (const f of mediumFormats) builder.set(f.name, f);
    builder.build();
  },
);

Deno.bench(
  "ManualIndexedMap.create (50 entries)",
  { group: "create-medium" },
  () => {
    createManualIndexedMap(
      mediumFormats.map((f) => [f.name, f] as [string, Format]),
    );
  },
);

Deno.bench(
  "IndexedRegistry.create (200 entries)",
  { group: "create-large", baseline: true },
  () => {
    const builder = createIndexedRegistryBuilder<string, Format>([
      createExtensionIndex("byExtension", (f) => f.extensions),
    ]);
    for (const f of largeFormats) builder.set(f.name, f);
    builder.build();
  },
);

Deno.bench(
  "ManualIndexedMap.create (200 entries)",
  { group: "create-large" },
  () => {
    createManualIndexedMap(
      largeFormats.map((f) => [f.name, f] as [string, Format]),
    );
  },
);

// =============================================================================
// Primary Key Lookup Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.get (10 entries)", {
  group: "get-small",
  baseline: true,
}, () => {
  indexedRegistrySmall.get("format5");
});

Deno.bench("ManualIndexedMap.get (10 entries)", { group: "get-small" }, () => {
  manualIndexedSmall.get("format5");
});

Deno.bench("IndexedRegistry.get (50 entries)", {
  group: "get-medium",
  baseline: true,
}, () => {
  indexedRegistryMedium.get("format25");
});

Deno.bench("ManualIndexedMap.get (50 entries)", { group: "get-medium" }, () => {
  manualIndexedMedium.get("format25");
});

Deno.bench("IndexedRegistry.get (200 entries)", {
  group: "get-large",
  baseline: true,
}, () => {
  indexedRegistryLarge.get("format100");
});

Deno.bench("ManualIndexedMap.get (200 entries)", { group: "get-large" }, () => {
  manualIndexedLarge.get("format100");
});

// =============================================================================
// Index Lookup Benchmarks
// =============================================================================

Deno.bench(
  "IndexedRegistry.getByIndex (10 entries)",
  { group: "getByIndex-small", baseline: true },
  () => {
    indexedRegistrySmall.getByIndex("byExtension", ".ext5");
  },
);

Deno.bench("ManualIndexedMap.getByExtension (10 entries)", {
  group: "getByIndex-small",
}, () => {
  manualIndexedSmall.getByExtension(".ext5");
});

Deno.bench(
  "IndexedRegistry.getByIndex (50 entries)",
  { group: "getByIndex-medium", baseline: true },
  () => {
    indexedRegistryMedium.getByIndex("byExtension", ".ext25");
  },
);

Deno.bench("ManualIndexedMap.getByExtension (50 entries)", {
  group: "getByIndex-medium",
}, () => {
  manualIndexedMedium.getByExtension(".ext25");
});

Deno.bench(
  "IndexedRegistry.getByIndex (200 entries)",
  { group: "getByIndex-large", baseline: true },
  () => {
    indexedRegistryLarge.getByIndex("byExtension", ".ext100");
  },
);

Deno.bench("ManualIndexedMap.getByExtension (200 entries)", {
  group: "getByIndex-large",
}, () => {
  manualIndexedLarge.getByExtension(".ext100");
});

// =============================================================================
// Alternate Extension Lookup (tests normalization)
// =============================================================================

Deno.bench(
  "IndexedRegistry.getByIndex alternate ext",
  { group: "getByIndex-alt", baseline: true },
  () => {
    indexedRegistryMedium.getByIndex("byExtension", ".alt25");
  },
);

Deno.bench("ManualIndexedMap.getByExtension alternate ext", {
  group: "getByIndex-alt",
}, () => {
  manualIndexedMedium.getByExtension(".alt25");
});

// =============================================================================
// hasInIndex Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.hasInIndex", {
  group: "hasInIndex",
  baseline: true,
}, () => {
  indexedRegistryMedium.hasInIndex("byExtension", ".ext25");
});

Deno.bench("ManualIndexedMap.hasExtension", { group: "hasInIndex" }, () => {
  manualIndexedMedium.hasExtension(".ext25");
});

// =============================================================================
// Has (Primary Key) Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.has", { group: "has", baseline: true }, () => {
  indexedRegistryMedium.has("format25");
});

Deno.bench("ManualIndexedMap.has", { group: "has" }, () => {
  manualIndexedMedium.has("format25");
});

// =============================================================================
// Keys/Values/Entries Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.keys", { group: "keys", baseline: true }, () => {
  indexedRegistryMedium.keys();
});

Deno.bench(
  "IndexedRegistry.values",
  { group: "values", baseline: true },
  () => {
    indexedRegistryMedium.values();
  },
);

Deno.bench(
  "IndexedRegistry.entries",
  { group: "entries", baseline: true },
  () => {
    indexedRegistryMedium.entries();
  },
);

// =============================================================================
// toBuilder (Copy-on-Write) Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.toBuilder.set.build", {
  group: "copy-on-write",
  baseline: true,
}, () => {
  indexedRegistryMedium.toBuilder().set("newFormat", {
    name: "newFormat",
    extensions: [".new"],
    mimeType: "application/x-new",
  }).build();
});

Deno.bench("ManualIndexedMap.copy-and-add", { group: "copy-on-write" }, () => {
  const newFormat: Format = {
    name: "newFormat",
    extensions: [".new"],
    mimeType: "application/x-new",
  };
  createManualIndexedMap([
    ...mediumFormats.map((f) => [f.name, f] as [string, Format]),
    ["newFormat", newFormat],
  ]);
});

// =============================================================================
// Size Property Benchmarks
// =============================================================================

Deno.bench("IndexedRegistry.size", { group: "size", baseline: true }, () => {
  indexedRegistryMedium.size;
});

// =============================================================================
// Non-existent Key Lookups
// =============================================================================

Deno.bench(
  "IndexedRegistry.get (non-existent)",
  { group: "get-nonexistent", baseline: true },
  () => {
    indexedRegistryMedium.get("nonexistent");
  },
);

Deno.bench(
  "ManualIndexedMap.get (non-existent)",
  { group: "get-nonexistent" },
  () => {
    manualIndexedMedium.get("nonexistent");
  },
);

Deno.bench(
  "IndexedRegistry.getByIndex (non-existent)",
  { group: "getByIndex-nonexistent", baseline: true },
  () => {
    indexedRegistryMedium.getByIndex("byExtension", ".nonexistent");
  },
);

Deno.bench(
  "ManualIndexedMap.getByExtension (non-existent)",
  { group: "getByIndex-nonexistent" },
  () => {
    manualIndexedMedium.getByExtension(".nonexistent");
  },
);

// =============================================================================
// Non-existent Index Name
// =============================================================================

Deno.bench(
  "IndexedRegistry.getByIndex (invalid index)",
  { group: "invalid-index", baseline: true },
  () => {
    indexedRegistryMedium.getByIndex("invalidIndex", ".ext25");
  },
);
