// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  EntryDescriptor,
  Factory,
  IndexConfig,
  IndexedRegistry,
  IndexedRegistryBuilder,
} from "./types.ts";

// =============================================================================
// IndexedRegistry Implementation
// =============================================================================

/**
 * Create an IndexedRegistryBuilder with multi-key lookup support.
 *
 * @example
 * ```typescript
 * const builder = createIndexedRegistryBuilder<string, WriterFormat>([
 *   {
 *     name: "byExtension",
 *     extractor: (format) => format.extensions,
 *     normalize: (ext) => ext.toLowerCase().replace(/^\./, ""),
 *   },
 * ]);
 *
 * builder
 *   .set("json", { name: "json", extensions: [".json"] })
 *   .set("yaml", { name: "yaml", extensions: [".yaml", ".yml"] });
 *
 * const registry = builder.build();
 *
 * registry.get("json");                        // By primary key
 * registry.getByIndex("byExtension", "json");  // By extension
 * registry.getByIndex("byExtension", "yml");   // By alternate extension
 * ```
 */
export const createIndexedRegistryBuilder = <
  K extends string = string,
  V = unknown,
>(
  indexes: ReadonlyArray<IndexConfig<V>>,
): IndexedRegistryBuilder<K, V> => {
  const entries = new Map<K, EntryDescriptor<V>>();
  let sealed = false;

  const assertNotSealed = (): void => {
    if (sealed) {
      throw new Error(
        "IndexedRegistryBuilder has been sealed. Use registry.toBuilder() to create a new builder.",
      );
    }
  };

  const builder = {
    set: (key: K, value: V): IndexedRegistryBuilder<K, V> => {
      assertNotSealed();
      entries.set(key, ["value", value]);
      return builder;
    },

    setLazy: (key: K, factory: Factory<V>): IndexedRegistryBuilder<K, V> => {
      assertNotSealed();
      entries.set(key, ["lazy", factory]);
      return builder;
    },

    remove: (key: K): IndexedRegistryBuilder<K, V> => {
      assertNotSealed();
      entries.delete(key);
      return builder;
    },

    has: (key: K): boolean => entries.has(key),

    get size(): number {
      return entries.size;
    },

    build: (): IndexedRegistry<K, V> => {
      assertNotSealed();
      sealed = true;
      return createIndexedRegistry(entries, indexes);
    },
  } satisfies IndexedRegistryBuilder<K, V>;

  return builder;
};

/**
 * Create an IndexedRegistry from entries and index configurations.
 */
const createIndexedRegistry = <K extends string, V>(
  entries: ReadonlyMap<K, EntryDescriptor<V>>,
  indexes: ReadonlyArray<IndexConfig<V>>,
): IndexedRegistry<K, V> => {
  // Build index maps: indexName -> (indexKey -> primaryKey)
  const indexMaps = new Map<string, Map<string, K>>();

  for (const indexConfig of indexes) {
    indexMaps.set(indexConfig.name, new Map());
  }

  // Populate indexes from entries
  for (const [primaryKey, descriptor] of entries) {
    const [lifetime, valueOrFactory] = descriptor;

    // Only index "value" lifetime entries (immediate values)
    if (lifetime === "value") {
      const value = valueOrFactory as V;
      for (const indexConfig of indexes) {
        const indexMap = indexMaps.get(indexConfig.name)!;
        const indexKeys = indexConfig.extractor(value);
        for (const indexKey of indexKeys) {
          const normalizedKey = indexConfig.normalize
            ? indexConfig.normalize(indexKey)
            : indexKey;
          indexMap.set(normalizedKey, primaryKey);
        }
      }
    }
  }

  // Caches
  let keysCache: readonly K[] | null = null;
  let valuesCache: readonly V[] | null = null;
  let entriesCache: readonly (readonly [K, V])[] | null = null;
  const lazyCache = new Map<K, V>();

  const resolveSync = (
    key: K,
    descriptor: EntryDescriptor<V>,
  ): V | undefined => {
    const [lifetime, valueOrFactory] = descriptor;

    if (lifetime === "value") {
      return valueOrFactory as V;
    }

    // lifetime === "lazy"
    if (lazyCache.has(key)) {
      return lazyCache.get(key);
    }

    const factory = valueOrFactory as Factory<V>;
    const result = factory();

    if (result instanceof Promise) {
      return undefined;
    }

    lazyCache.set(key, result);
    return result;
  };

  const resolveAsync = async (
    key: K,
    descriptor: EntryDescriptor<V>,
  ): Promise<V | undefined> => {
    const [lifetime, valueOrFactory] = descriptor;

    if (lifetime === "value") {
      return valueOrFactory as V;
    }

    // lifetime === "lazy"
    if (lazyCache.has(key)) {
      return lazyCache.get(key);
    }

    const factory = valueOrFactory as Factory<V>;
    const result = await factory();
    lazyCache.set(key, result);
    return result;
  };

  const registry: IndexedRegistry<K, V> = {
    get: (key: K): V | undefined => {
      const descriptor = entries.get(key);
      if (descriptor === undefined) {
        return undefined;
      }
      return resolveSync(key, descriptor);
    },

    getAsync: async (key: K): Promise<V | undefined> => {
      const descriptor = entries.get(key);
      if (descriptor === undefined) {
        return undefined;
      }
      return await resolveAsync(key, descriptor);
    },

    has: (key: K): boolean => entries.has(key),

    isLazy: (key: K): boolean => {
      const descriptor = entries.get(key);
      if (descriptor === undefined) {
        return false;
      }
      return descriptor[0] === "lazy";
    },

    keys: (): readonly K[] => {
      if (keysCache === null) {
        keysCache = Object.freeze([...entries.keys()]);
      }
      return keysCache;
    },

    values: (): readonly V[] => {
      if (valuesCache === null) {
        const values: V[] = [];
        for (const [key, descriptor] of entries) {
          const [lifetime] = descriptor;
          if (lifetime === "value") {
            values.push(descriptor[1] as V);
          } else if (lifetime === "lazy" && lazyCache.has(key)) {
            values.push(lazyCache.get(key)!);
          }
        }
        valuesCache = Object.freeze(values);
      }
      return valuesCache;
    },

    entries: (): readonly (readonly [K, V])[] => {
      if (entriesCache === null) {
        const result: (readonly [K, V])[] = [];
        for (const [key, descriptor] of entries) {
          const [lifetime] = descriptor;
          if (lifetime === "value") {
            result.push([key, descriptor[1] as V] as const);
          } else if (lifetime === "lazy" && lazyCache.has(key)) {
            result.push([key, lazyCache.get(key)!] as const);
          }
        }
        entriesCache = Object.freeze(result);
      }
      return entriesCache;
    },

    get size(): number {
      return entries.size;
    },

    toBuilder: () => {
      const newBuilder = createIndexedRegistryBuilder<K, V>(indexes);
      for (const [key, descriptor] of entries) {
        const [lifetime, valueOrFactory] = descriptor;
        if (lifetime === "value") {
          newBuilder.set(key, valueOrFactory as V);
        } else if (lifetime === "lazy") {
          newBuilder.setLazy(key, valueOrFactory as Factory<V>);
        }
      }
      return newBuilder;
    },

    // Indexed-specific methods
    getByIndex: (indexName: string, key: string): V | undefined => {
      const indexMap = indexMaps.get(indexName);
      if (indexMap === undefined) {
        return undefined;
      }

      // Find the index config for normalization
      const indexConfig = indexes.find((i) => i.name === indexName);
      const normalizedKey = indexConfig?.normalize
        ? indexConfig.normalize(key)
        : key;

      const primaryKey = indexMap.get(normalizedKey);
      if (primaryKey === undefined) {
        return undefined;
      }

      return registry.get(primaryKey);
    },

    hasInIndex: (indexName: string, key: string): boolean => {
      const indexMap = indexMaps.get(indexName);
      if (indexMap === undefined) {
        return false;
      }

      const indexConfig = indexes.find((i) => i.name === indexName);
      const normalizedKey = indexConfig?.normalize
        ? indexConfig.normalize(key)
        : key;

      return indexMap.has(normalizedKey);
    },
  };

  return Object.freeze(registry);
};

// =============================================================================
// Utility: Extension Index Helper
// =============================================================================

/**
 * Create an index configuration for file extensions.
 *
 * @example
 * ```typescript
 * const builder = createIndexedRegistryBuilder([
 *   createExtensionIndex<WriterFormat>("byExtension", (f) => f.extensions),
 * ]);
 * ```
 */
export const createExtensionIndex = <V>(
  name: string,
  extractor: (value: V) => readonly string[],
): IndexConfig<V> => ({
  name,
  extractor,
  normalize: (ext: string) => ext.toLowerCase().replace(/^\./, ""),
});
