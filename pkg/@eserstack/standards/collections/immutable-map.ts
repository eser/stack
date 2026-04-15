// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// ImmutableMap Types
// =============================================================================

/**
 * Mutable builder for constructing ImmutableMap instances.
 *
 * During the build phase, entries can be added and removed.
 * Call `.build()` to seal into an immutable ImmutableMap.
 */
export type ImmutableMapBuilder<K extends string = string, V = unknown> = {
  /** Add or update an entry. */
  readonly set: (key: K, value: V) => ImmutableMapBuilder<K, V>;
  /** Remove an entry by key. */
  readonly delete: (key: K) => ImmutableMapBuilder<K, V>;
  /** Check if an entry exists. */
  readonly has: (key: K) => boolean;
  /** Get the number of entries. */
  readonly size: number;
  /** Seal and return an immutable ImmutableMap. */
  readonly build: () => ImmutableMap<K, V>;
};

/**
 * Immutable key-value map.
 *
 * Like Immutable.js Map but with Builder pattern.
 * All mutation methods return new instances (via internal builder).
 *
 * @example
 * ```typescript
 * // Build phase
 * const map = createMapBuilder<string, number>()
 *   .set("a", 1)
 *   .set("b", 2)
 *   .build();
 *
 * // Read phase
 * map.get("a");        // 1
 * map.has("b");        // true
 * for (const [k, v] of map) { console.log(k, v); }
 *
 * // Copy-on-write
 * const extended = map.toBuilder().set("c", 3).build();
 * ```
 */
export type ImmutableMap<K extends string = string, V = unknown> = {
  // === Core Read Operations ===
  /** Get a value by key. O(1). */
  readonly get: (key: K) => V | undefined;
  /** Check if a key exists. O(1). */
  readonly has: (key: K) => boolean;
  /** Number of entries. O(1). */
  readonly size: number;
  /** True if map has no entries. O(1). */
  readonly isEmpty: boolean;

  // === Iteration (Iterator Protocol) ===
  /** Iterate over keys. Lazy. */
  readonly keys: () => IterableIterator<K>;
  /** Iterate over values. Lazy. */
  readonly values: () => IterableIterator<V>;
  /** Iterate over [key, value] pairs. Lazy. */
  readonly entries: () => IterableIterator<readonly [K, V]>;
  /** Execute callback for each entry. */
  readonly forEach: (
    fn: (value: V, key: K, map: ImmutableMap<K, V>) => void,
  ) => void;
  /** Iterator protocol - enables for...of. */
  readonly [Symbol.iterator]: () => IterableIterator<readonly [K, V]>;

  // === Transforms (Return NEW instances) ===
  /** Transform values, return new map. */
  readonly map: <U>(fn: (value: V, key: K) => U) => ImmutableMap<K, U>;
  /** Filter entries, return new map. */
  readonly filter: (fn: (value: V, key: K) => boolean) => ImmutableMap<K, V>;
  /** Reduce to a single value. */
  readonly reduce: <U>(fn: (acc: U, value: V, key: K) => U, initial: U) => U;

  // === Copy-on-Write Modification ===
  /** Create a mutable builder with all entries copied. */
  readonly toBuilder: () => ImmutableMapBuilder<K, V>;
  /** Merge with other maps, return new map. */
  readonly merge: (...others: ImmutableMap<K, V>[]) => ImmutableMap<K, V>;
};

// =============================================================================
// ImmutableMapBuilder Implementation
// =============================================================================

/**
 * Create a mutable builder for ImmutableMap.
 *
 * @example
 * ```typescript
 * const map = createMapBuilder<string, number>()
 *   .set("x", 1)
 *   .set("y", 2)
 *   .delete("x")
 *   .build();
 * ```
 */
export const createMapBuilder = <
  K extends string = string,
  V = unknown,
>(): ImmutableMapBuilder<K, V> => {
  const entries = new Map<K, V>();
  let sealed = false;

  const assertNotSealed = (): void => {
    if (sealed) {
      throw new Error(
        "ImmutableMapBuilder has been sealed. Use map.toBuilder() to create a new builder.",
      );
    }
  };

  const builder: ImmutableMapBuilder<K, V> = {
    set: (key: K, value: V): ImmutableMapBuilder<K, V> => {
      assertNotSealed();
      entries.set(key, value);
      return builder;
    },

    delete: (key: K): ImmutableMapBuilder<K, V> => {
      assertNotSealed();
      entries.delete(key);
      return builder;
    },

    has: (key: K): boolean => entries.has(key),

    get size(): number {
      return entries.size;
    },

    build: (): ImmutableMap<K, V> => {
      assertNotSealed();
      sealed = true;
      return createImmutableMap(entries);
    },
  };

  return builder;
};

/**
 * Create an ImmutableMap from entries.
 *
 * @example
 * ```typescript
 * const map = createMap([["a", 1], ["b", 2]]);
 * const empty = createMap<string, number>();
 * ```
 */
export const createMap = <K extends string = string, V = unknown>(
  entries?: Iterable<readonly [K, V]>,
): ImmutableMap<K, V> => {
  const map = new Map<K, V>();
  if (entries) {
    for (const [key, value] of entries) {
      map.set(key, value);
    }
  }
  return createImmutableMap(map);
};

// =============================================================================
// ImmutableMap Implementation (Internal)
// =============================================================================

/**
 * Create an ImmutableMap from a Map (internal).
 */
const createImmutableMap = <K extends string, V>(
  entries: ReadonlyMap<K, V>,
): ImmutableMap<K, V> => {
  const map: ImmutableMap<K, V> = {
    // === Core Read Operations ===
    get: (key: K): V | undefined => entries.get(key),

    has: (key: K): boolean => entries.has(key),

    get size(): number {
      return entries.size;
    },

    get isEmpty(): boolean {
      return entries.size === 0;
    },

    // === Iteration (Iterator Protocol) ===
    keys: function* (): IterableIterator<K> {
      yield* entries.keys();
    },

    values: function* (): IterableIterator<V> {
      yield* entries.values();
    },

    entries: function* (): IterableIterator<readonly [K, V]> {
      for (const entry of entries.entries()) {
        yield entry as readonly [K, V];
      }
    },

    forEach: (fn: (value: V, key: K, m: ImmutableMap<K, V>) => void): void => {
      for (const [key, value] of entries) {
        fn(value, key, map);
      }
    },

    [Symbol.iterator]: function* (): IterableIterator<readonly [K, V]> {
      for (const entry of entries.entries()) {
        yield entry as readonly [K, V];
      }
    },

    // === Transforms ===
    map: <U>(fn: (value: V, key: K) => U): ImmutableMap<K, U> => {
      const builder = createMapBuilder<K, U>();
      for (const [key, value] of entries) {
        builder.set(key, fn(value, key));
      }
      return builder.build();
    },

    filter: (fn: (value: V, key: K) => boolean): ImmutableMap<K, V> => {
      const builder = createMapBuilder<K, V>();
      for (const [key, value] of entries) {
        if (fn(value, key)) {
          builder.set(key, value);
        }
      }
      return builder.build();
    },

    reduce: <U>(fn: (acc: U, value: V, key: K) => U, initial: U): U => {
      let acc = initial;
      for (const [key, value] of entries) {
        acc = fn(acc, value, key);
      }
      return acc;
    },

    // === Copy-on-Write ===
    toBuilder: (): ImmutableMapBuilder<K, V> => {
      const builder = createMapBuilder<K, V>();
      for (const [key, value] of entries) {
        builder.set(key, value);
      }
      return builder;
    },

    merge: (...others: ImmutableMap<K, V>[]): ImmutableMap<K, V> => {
      const builder = createMapBuilder<K, V>();
      // Add entries from this map
      for (const [key, value] of entries) {
        builder.set(key, value);
      }
      // Add entries from other maps (later maps override earlier)
      for (const other of others) {
        for (const [key, value] of other) {
          builder.set(key, value);
        }
      }
      return builder.build();
    },
  };

  return Object.freeze(map);
};

// =============================================================================
// Empty Map Singleton
// =============================================================================

/**
 * Empty immutable map singleton.
 * Useful as a default or placeholder.
 */
export const EMPTY_MAP: ImmutableMap<string, never> = createMap<
  string,
  never
>();
