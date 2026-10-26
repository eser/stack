// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  EntryDescriptor,
  Factory,
  Registry,
  RegistryBuilder,
} from "./types.ts";

// =============================================================================
// Internal State Type
// =============================================================================

type RegistryState<K extends string, V> = {
  readonly entries: ReadonlyMap<K, EntryDescriptor<V>>;
  // Cached arrays - rebuilt only when accessed after invalidation
  keysCache: readonly K[] | null;
  valuesCache: readonly V[] | null;
  entriesCache: readonly (readonly [K, V])[] | null;
  // Lazy value cache (for "lazy" lifetime entries)
  lazyCache: Map<K, V>;
};

// =============================================================================
// Internal Builder Factory (to avoid circular imports)
// =============================================================================

/**
 * Create a builder from existing entries.
 * This is an internal implementation to avoid circular dependencies.
 */
const createBuilderFromEntries = <K extends string, V>(
  entries: ReadonlyMap<K, EntryDescriptor<V>>,
): RegistryBuilder<K, V> => {
  const newEntries = new Map(entries);
  let sealed = false;

  const assertNotSealed = (): void => {
    if (sealed) {
      throw new Error(
        "RegistryBuilder has been sealed. Use registry.toBuilder() to create a new builder.",
      );
    }
  };

  const builder: RegistryBuilder<K, V> = {
    set: (key: K, value: V) => {
      assertNotSealed();
      newEntries.set(key, ["value", value]);
      return builder;
    },

    setLazy: (key: K, factory: Factory<V>) => {
      assertNotSealed();
      newEntries.set(key, ["lazy", factory]);
      return builder;
    },

    remove: (key: K) => {
      assertNotSealed();
      newEntries.delete(key);
      return builder;
    },

    has: (key: K) => newEntries.has(key),

    get size() {
      return newEntries.size;
    },

    build: () => {
      assertNotSealed();
      sealed = true;
      return createRegistry(newEntries);
    },
  };

  return builder;
};

// =============================================================================
// Registry Implementation
// =============================================================================

/**
 * Create a sealed, immutable Registry from entry descriptors.
 *
 * This is called by RegistryBuilder.build() and should not be used directly.
 * Use createRegistryBuilder() instead.
 */
export const createRegistry = <K extends string = string, V = unknown>(
  entries: ReadonlyMap<K, EntryDescriptor<V>>,
): Registry<K, V> => {
  const state: RegistryState<K, V> = {
    entries,
    keysCache: null,
    valuesCache: null,
    entriesCache: null,
    lazyCache: new Map(),
  };

  /**
   * Resolve a value from a descriptor (synchronous).
   */
  const resolveSync = (
    key: K,
    descriptor: EntryDescriptor<V>,
  ): V | undefined => {
    const [lifetime, valueOrFactory] = descriptor;

    if (lifetime === "value") {
      return valueOrFactory as V;
    }

    // lifetime === "lazy"
    if (state.lazyCache.has(key)) {
      return state.lazyCache.get(key);
    }

    const factory = valueOrFactory as Factory<V>;
    const result = factory();

    // Handle sync result only
    if (result instanceof Promise) {
      // For sync access, return undefined for async factories
      // Use getAsync() for async factories
      return undefined;
    }

    state.lazyCache.set(key, result);
    return result;
  };

  /**
   * Resolve a value asynchronously.
   */
  const resolveAsync = async (
    key: K,
    descriptor: EntryDescriptor<V>,
  ): Promise<V | undefined> => {
    const [lifetime, valueOrFactory] = descriptor;

    if (lifetime === "value") {
      return valueOrFactory as V;
    }

    // lifetime === "lazy"
    if (state.lazyCache.has(key)) {
      return state.lazyCache.get(key);
    }

    const factory = valueOrFactory as Factory<V>;
    const result = await factory();
    state.lazyCache.set(key, result);
    return result;
  };

  const registry: Registry<K, V> = {
    get: (key: K): V | undefined => {
      const descriptor = state.entries.get(key);
      if (descriptor === undefined) {
        return undefined;
      }
      return resolveSync(key, descriptor);
    },

    getAsync: async (key: K): Promise<V | undefined> => {
      const descriptor = state.entries.get(key);
      if (descriptor === undefined) {
        return undefined;
      }
      return await resolveAsync(key, descriptor);
    },

    has: (key: K): boolean => state.entries.has(key),

    isLazy: (key: K): boolean => {
      const descriptor = state.entries.get(key);
      if (descriptor === undefined) {
        return false;
      }
      return descriptor[0] === "lazy";
    },

    keys: (): readonly K[] => {
      if (state.keysCache === null) {
        state.keysCache = Object.freeze([...state.entries.keys()]);
      }
      return state.keysCache;
    },

    values: (): readonly V[] => {
      if (state.valuesCache === null) {
        const values: V[] = [];
        for (const [key, descriptor] of state.entries) {
          const [lifetime] = descriptor;
          // Only include "value" lifetime and already-cached "lazy" values
          if (lifetime === "value") {
            values.push(descriptor[1] as V);
          } else if (lifetime === "lazy" && state.lazyCache.has(key)) {
            values.push(state.lazyCache.get(key)!);
          }
        }
        state.valuesCache = Object.freeze(values);
      }
      return state.valuesCache;
    },

    entries: (): readonly (readonly [K, V])[] => {
      if (state.entriesCache === null) {
        const entries: (readonly [K, V])[] = [];
        for (const [key, descriptor] of state.entries) {
          const [lifetime] = descriptor;
          if (lifetime === "value") {
            entries.push([key, descriptor[1] as V] as const);
          } else if (lifetime === "lazy" && state.lazyCache.has(key)) {
            entries.push([key, state.lazyCache.get(key)!] as const);
          }
        }
        state.entriesCache = Object.freeze(entries);
      }
      return state.entriesCache;
    },

    get size(): number {
      return state.entries.size;
    },

    toBuilder: (): RegistryBuilder<K, V> => {
      return createBuilderFromEntries(state.entries);
    },
  };

  return Object.freeze(registry);
};

// =============================================================================
// Empty Registry Singleton
// =============================================================================

/**
 * An empty, immutable registry.
 * Useful as a default or placeholder.
 */
export const EMPTY_REGISTRY: Registry<string, unknown> = createRegistry(
  new Map(),
);
