// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Promisable } from "@eser/primitives/promises";

// =============================================================================
// Core Types
// =============================================================================

/**
 * Lifetime strategies for registry entries.
 *
 * - `value`: Direct value stored as-is
 * - `lazy`: Factory executed once on first access, then cached
 */
export type Lifetime = "value" | "lazy";

/**
 * Factory function that produces a value, optionally async.
 */
export type Factory<V> = () => Promisable<V>;

/**
 * Entry descriptor tuple storing lifetime and value/factory.
 * Uses tuple for memory efficiency.
 */
export type EntryDescriptor<V> = readonly [
  lifetime: Lifetime,
  valueOrFactory: V | Factory<V>,
];

// =============================================================================
// Registry Item Interface
// =============================================================================

/**
 * Base interface for named registry items.
 * Items must have a unique name for O(1) lookup.
 */
export type RegistryItem = {
  readonly name: string;
};

// =============================================================================
// RegistryBuilder Interface (Mutable Build Phase)
// =============================================================================

/**
 * Mutable builder interface for constructing registries.
 *
 * During the build phase, entries can be added, removed, and modified.
 * Call `.build()` to seal the registry into an immutable form.
 *
 * @example
 * ```typescript
 * const builder = createRegistryBuilder<string, Service>();
 * builder
 *   .set("logger", loggerInstance)
 *   .setLazy("database", () => connectToDatabase());
 *
 * const registry = builder.build(); // Sealed, immutable
 * ```
 */
export type RegistryBuilder<K extends string = string, V = unknown> = {
  /**
   * Register a direct value (lifetime: "value").
   * The value is stored as-is and returned on every access.
   */
  readonly set: (key: K, value: V) => RegistryBuilder<K, V>;

  /**
   * Register a lazy factory (lifetime: "lazy").
   * Factory is executed once on first access, then cached.
   */
  readonly setLazy: (key: K, factory: Factory<V>) => RegistryBuilder<K, V>;

  /**
   * Remove an entry by key.
   */
  readonly remove: (key: K) => RegistryBuilder<K, V>;

  /**
   * Check if an entry exists.
   */
  readonly has: (key: K) => boolean;

  /**
   * Get the number of entries.
   */
  readonly size: number;

  /**
   * Seal the builder and return an immutable Registry.
   * After calling build(), this builder should not be reused.
   */
  readonly build: () => Registry<K, V>;
};

// =============================================================================
// Registry Interface (Immutable Sealed Phase)
// =============================================================================

/**
 * Immutable sealed registry interface.
 *
 * After a RegistryBuilder is sealed with `.build()`, it becomes a Registry
 * with read-only access. To modify, use `.toBuilder()` for copy-on-write.
 *
 * @example
 * ```typescript
 * const registry = builder.build();
 *
 * // Read operations
 * registry.get("logger");        // Service | undefined
 * registry.has("database");      // boolean
 * registry.keys();               // readonly string[]
 *
 * // Copy-on-write modification
 * const extended = registry
 *   .toBuilder()
 *   .set("newService", newInstance)
 *   .build();
 * ```
 */
export type Registry<K extends string = string, V = unknown> = {
  /**
   * Get a value by key (synchronous).
   * For lazy entries, executes factory if sync.
   */
  readonly get: (key: K) => V | undefined;

  /**
   * Get a value by key (asynchronous).
   * Handles async factories properly.
   */
  readonly getAsync: (key: K) => Promise<V | undefined>;

  /**
   * Check if an entry exists.
   */
  readonly has: (key: K) => boolean;

  /**
   * Check if an entry is lazy (has a factory).
   */
  readonly isLazy: (key: K) => boolean;

  /**
   * Get all keys as a frozen array (cached).
   */
  readonly keys: () => readonly K[];

  /**
   * Get all resolved values as a frozen array (cached).
   * Note: Only returns values for "value" and already-resolved "lazy" entries.
   */
  readonly values: () => readonly V[];

  /**
   * Get all entries as frozen key-value tuples (cached).
   */
  readonly entries: () => readonly (readonly [K, V])[];

  /**
   * Get the number of entries.
   */
  readonly size: number;

  /**
   * Create a new builder with all entries copied (copy-on-write).
   * Original registry remains unchanged.
   */
  readonly toBuilder: () => RegistryBuilder<K, V>;
};

// =============================================================================
// IndexedRegistry Interface (Multi-Key Lookup)
// =============================================================================

/**
 * Index configuration for multi-key lookup.
 *
 * @example
 * ```typescript
 * const formatIndex: IndexConfig<WriterFormat> = {
 *   name: "byExtension",
 *   extractor: (format) => format.extensions,
 *   normalize: (ext) => ext.toLowerCase().replace(/^\./, ""),
 * };
 * ```
 */
export type IndexConfig<V> = {
  /** Unique name for this index */
  readonly name: string;
  /** Extract index keys from a value */
  readonly extractor: (value: V) => readonly string[];
  /** Optional key normalizer (e.g., lowercase, remove dot prefix) */
  readonly normalize?: (key: string) => string;
};

/**
 * Indexed registry supporting multiple lookup keys.
 *
 * Extends Registry with the ability to look up entries by secondary keys
 * (e.g., file extensions for format registries).
 *
 * @example
 * ```typescript
 * const registry = createIndexedRegistryBuilder<string, WriterFormat>([
 *   { name: "byExtension", extractor: (f) => f.extensions }
 * ]).set("json", jsonFormat).build();
 *
 * registry.get("json");                    // By primary key
 * registry.getByIndex("byExtension", ".json"); // By extension
 * ```
 */
export type IndexedRegistry<K extends string = string, V = unknown> =
  & Registry<K, V>
  & {
    /**
     * Get a value by an index key.
     */
    readonly getByIndex: (indexName: string, key: string) => V | undefined;

    /**
     * Check if an index key exists.
     */
    readonly hasInIndex: (indexName: string, key: string) => boolean;
  };

/**
 * Builder for indexed registries.
 * All methods return IndexedRegistryBuilder for proper chaining.
 */
export type IndexedRegistryBuilder<K extends string = string, V = unknown> = {
  readonly set: (key: K, value: V) => IndexedRegistryBuilder<K, V>;
  readonly setLazy: (
    key: K,
    factory: Factory<V>,
  ) => IndexedRegistryBuilder<K, V>;
  readonly remove: (key: K) => IndexedRegistryBuilder<K, V>;
  readonly has: (key: K) => boolean;
  readonly size: number;
  readonly build: () => IndexedRegistry<K, V>;
};

// =============================================================================
// Type Registry Pattern Utilities
// =============================================================================

/**
 * Extract keys from a registry type interface.
 *
 * @example
 * ```typescript
 * interface MyRegistry {
 *   "item-a": ItemA;
 *   "item-b": ItemB;
 * }
 *
 * type Keys = RegistryKeys<MyRegistry>; // "item-a" | "item-b"
 * ```
 */
export type RegistryKeys<T> = keyof T & string;

/**
 * Extract value type for a key from a registry type interface.
 *
 * @example
 * ```typescript
 * interface MyRegistry {
 *   "item-a": ItemA;
 *   "item-b": ItemB;
 * }
 *
 * type ValueA = RegistryValue<MyRegistry, "item-a">; // ItemA
 * ```
 */
export type RegistryValue<T, K extends keyof T> = T[K];
