// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  EntryDescriptor,
  Factory,
  Lifetime,
  RegistryBuilder,
} from "./types.ts";
import { createRegistry } from "./registry.ts";

// =============================================================================
// Internal State Type
// =============================================================================

type BuilderState<K extends string, V> = {
  readonly entries: Map<K, EntryDescriptor<V>>;
  sealed: boolean;
};

// =============================================================================
// RegistryBuilder Implementation
// =============================================================================

/**
 * Create a new mutable RegistryBuilder.
 *
 * @example
 * ```typescript
 * const builder = createRegistryBuilder<string, Service>();
 *
 * builder
 *   .set("logger", loggerInstance)
 *   .setLazy("database", () => connectToDatabase());
 *
 * const registry = builder.build();
 * ```
 */
export const createRegistryBuilder = <
  K extends string = string,
  V = unknown,
>(
  initialEntries?: ReadonlyMap<K, EntryDescriptor<V>>,
): RegistryBuilder<K, V> => {
  const state: BuilderState<K, V> = {
    entries: new Map(initialEntries),
    sealed: false,
  };

  const assertNotSealed = (): void => {
    if (state.sealed) {
      throw new Error(
        "RegistryBuilder has been sealed. Use registry.toBuilder() to create a new builder.",
      );
    }
  };

  const setEntry = (
    key: K,
    valueOrFactory: V | Factory<V>,
    lifetime: Lifetime,
  ): RegistryBuilder<K, V> => {
    assertNotSealed();
    state.entries.set(key, [lifetime, valueOrFactory]);
    return builder;
  };

  const builder: RegistryBuilder<K, V> = {
    set: (key: K, value: V) => setEntry(key, value, "value"),

    setLazy: (key: K, factory: Factory<V>) => setEntry(key, factory, "lazy"),

    remove: (key: K) => {
      assertNotSealed();
      state.entries.delete(key);
      return builder;
    },

    has: (key: K) => state.entries.has(key),

    get size() {
      return state.entries.size;
    },

    build: () => {
      assertNotSealed();
      state.sealed = true;
      return createRegistry(state.entries);
    },
  };

  return builder;
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a builder from an array of entries.
 *
 * @example
 * ```typescript
 * const builder = fromEntries([
 *   ["logger", loggerInstance, "value"],
 *   ["database", connectFn, "lazy"],
 * ]);
 * ```
 */
export const fromEntries = <K extends string, V>(
  entries: ReadonlyArray<readonly [K, V | Factory<V>, Lifetime?]>,
): RegistryBuilder<K, V> => {
  const builder = createRegistryBuilder<K, V>();
  for (const [key, valueOrFactory, lifetime = "value"] of entries) {
    switch (lifetime) {
      case "value":
        builder.set(key, valueOrFactory as V);
        break;
      case "lazy":
        builder.setLazy(key, valueOrFactory as Factory<V>);
        break;
    }
  }
  return builder;
};

/**
 * Merge multiple registries into a new builder.
 * Later registries override earlier ones for duplicate keys.
 *
 * Note: This only preserves values, not lazy factories. Use for simple merging.
 *
 * @example
 * ```typescript
 * const merged = mergeBuilders(registry1, registry2);
 * const newRegistry = merged.build();
 * ```
 */
export const mergeBuilders = <K extends string, V>(
  ...registries: ReadonlyArray<
    { keys: () => readonly K[]; get: (key: K) => V | undefined }
  >
): RegistryBuilder<K, V> => {
  const result = createRegistryBuilder<K, V>();

  for (const registry of registries) {
    for (const key of registry.keys()) {
      const value = registry.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
  }

  return result;
};
