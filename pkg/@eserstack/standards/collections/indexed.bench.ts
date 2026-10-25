// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as indexed from "./indexed.ts";

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
  const builder = indexed.createIndexedRegistryBuilder<string, Format>([
    indexed.createExtensionIndex("byExtension", (f) => f.extensions),
  ]);
  for (const f of smallFormats) builder.set(f.name, f);
  return builder.build();
})();

const indexedRegistryMedium = (() => {
  const builder = indexed.createIndexedRegistryBuilder<string, Format>([
    indexed.createExtensionIndex("byExtension", (f) => f.extensions),
  ]);
  for (const f of mediumFormats) builder.set(f.name, f);
  return builder.build();
})();

const indexedRegistryLarge = (() => {
  const builder = indexed.createIndexedRegistryBuilder<string, Format>([
    indexed.createExtensionIndex("byExtension", (f) => f.extensions),
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

mitata.group("create-small", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.create (10 entries)", () => {
        const builder = indexed.createIndexedRegistryBuilder<string, Format>([
          indexed.createExtensionIndex("byExtension", (f) => f.extensions),
        ]);
        for (const f of smallFormats) builder.set(f.name, f);
        builder.build();
      })
      .baseline();
    mitata.bench("ManualIndexedMap.create (10 entries)", () => {
      createManualIndexedMap(
        smallFormats.map((f) => [f.name, f] as [string, Format]),
      );
    });
  });
});

mitata.group("create-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.create (50 entries)", () => {
        const builder = indexed.createIndexedRegistryBuilder<string, Format>([
          indexed.createExtensionIndex("byExtension", (f) => f.extensions),
        ]);
        for (const f of mediumFormats) builder.set(f.name, f);
        builder.build();
      })
      .baseline();
    mitata.bench("ManualIndexedMap.create (50 entries)", () => {
      createManualIndexedMap(
        mediumFormats.map((f) => [f.name, f] as [string, Format]),
      );
    });
  });
});

mitata.group("create-large", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.create (200 entries)", () => {
        const builder = indexed.createIndexedRegistryBuilder<string, Format>([
          indexed.createExtensionIndex("byExtension", (f) => f.extensions),
        ]);
        for (const f of largeFormats) builder.set(f.name, f);
        builder.build();
      })
      .baseline();
    mitata.bench("ManualIndexedMap.create (200 entries)", () => {
      createManualIndexedMap(
        largeFormats.map((f) => [f.name, f] as [string, Format]),
      );
    });
  });
});

// =============================================================================
// Primary Key Lookup Benchmarks
// =============================================================================

mitata.group("get-small", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.get (10 entries)", () => {
        indexedRegistrySmall.get("format5");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.get (10 entries)", () => {
      manualIndexedSmall.get("format5");
    });
  });
});

mitata.group("get-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.get (50 entries)", () => {
        indexedRegistryMedium.get("format25");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.get (50 entries)", () => {
      manualIndexedMedium.get("format25");
    });
  });
});

mitata.group("get-large", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.get (200 entries)", () => {
        indexedRegistryLarge.get("format100");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.get (200 entries)", () => {
      manualIndexedLarge.get("format100");
    });
  });
});

// =============================================================================
// Index Lookup Benchmarks
// =============================================================================

mitata.group("getByIndex-small", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex (10 entries)", () => {
        indexedRegistrySmall.getByIndex("byExtension", ".ext5");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.getByExtension (10 entries)", () => {
      manualIndexedSmall.getByExtension(".ext5");
    });
  });
});

mitata.group("getByIndex-medium", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex (50 entries)", () => {
        indexedRegistryMedium.getByIndex("byExtension", ".ext25");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.getByExtension (50 entries)", () => {
      manualIndexedMedium.getByExtension(".ext25");
    });
  });
});

mitata.group("getByIndex-large", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex (200 entries)", () => {
        indexedRegistryLarge.getByIndex("byExtension", ".ext100");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.getByExtension (200 entries)", () => {
      manualIndexedLarge.getByExtension(".ext100");
    });
  });
});

// =============================================================================
// Alternate Extension Lookup (tests normalization)
// =============================================================================

mitata.group("getByIndex-alt", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex alternate ext", () => {
        indexedRegistryMedium.getByIndex("byExtension", ".alt25");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.getByExtension alternate ext", () => {
      manualIndexedMedium.getByExtension(".alt25");
    });
  });
});

// =============================================================================
// hasInIndex Benchmarks
// =============================================================================

mitata.group("hasInIndex", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.hasInIndex", () => {
        indexedRegistryMedium.hasInIndex("byExtension", ".ext25");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.hasExtension", () => {
      manualIndexedMedium.hasExtension(".ext25");
    });
  });
});

// =============================================================================
// Has (Primary Key) Benchmarks
// =============================================================================

mitata.group("has", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.has", () => {
        indexedRegistryMedium.has("format25");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.has", () => {
      manualIndexedMedium.has("format25");
    });
  });
});

// =============================================================================
// Keys/Values/Entries Benchmarks
// =============================================================================

mitata.group("keys", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.keys", () => {
        indexedRegistryMedium.keys();
      })
      .baseline();
  });
});

mitata.group("values", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.values", () => {
        indexedRegistryMedium.values();
      })
      .baseline();
  });
});

mitata.group("entries", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.entries", () => {
        indexedRegistryMedium.entries();
      })
      .baseline();
  });
});

// =============================================================================
// toBuilder (Copy-on-Write) Benchmarks
// =============================================================================

mitata.group("copy-on-write", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.toBuilder.set.build", () => {
        indexedRegistryMedium
          .toBuilder()
          .set("newFormat", {
            name: "newFormat",
            extensions: [".new"],
            mimeType: "application/x-new",
          })
          .build();
      })
      .baseline();
    mitata.bench("ManualIndexedMap.copy-and-add", () => {
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
  });
});

// =============================================================================
// Size Property Benchmarks
// =============================================================================

mitata.group("size", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.size", () => {
        indexedRegistryMedium.size;
      })
      .baseline();
  });
});

// =============================================================================
// Non-existent Key Lookups
// =============================================================================

mitata.group("get-nonexistent", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.get (non-existent)", () => {
        indexedRegistryMedium.get("nonexistent");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.get (non-existent)", () => {
      manualIndexedMedium.get("nonexistent");
    });
  });
});

mitata.group("getByIndex-nonexistent", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex (non-existent)", () => {
        indexedRegistryMedium.getByIndex("byExtension", ".nonexistent");
      })
      .baseline();
    mitata.bench("ManualIndexedMap.getByExtension (non-existent)", () => {
      manualIndexedMedium.getByExtension(".nonexistent");
    });
  });
});

// =============================================================================
// Non-existent Index Name
// =============================================================================

mitata.group("invalid-index", () => {
  mitata.summary(() => {
    mitata
      .bench("IndexedRegistry.getByIndex (invalid index)", () => {
        indexedRegistryMedium.getByIndex("invalidIndex", ".ext25");
      })
      .baseline();
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
