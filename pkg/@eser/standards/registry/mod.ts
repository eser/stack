// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module registry
 *
 * Unified registry pattern for @eser packages.
 *
 * ## Overview
 *
 * This module provides a functional, immutable registry pattern with:
 * - **ImmutableMap**: Pure key-value container with Iterator protocol
 * - **Registry**: ImmutableMap + lazy factory support
 * - **Builder + Sealed Pattern**: Mutable during build, immutable once sealed
 * - **Type-Safe Keys**: TypeScript declaration merging for compile-time safety
 * - **Multi-Key Indexing**: Support for secondary lookup keys (e.g., file extensions)
 * - **Performance Utilities**: Bitmap matching, parameter caching, parallel imports
 *
 * ## Quick Start
 *
 * ### Layer 0: ImmutableMap (Pure Key-Value)
 *
 * ```typescript
 * import { createMapBuilder } from "@eser/standards/registry";
 *
 * // Build phase (mutable)
 * const map = createMapBuilder<string, number>()
 *   .set("a", 1)
 *   .set("b", 2)
 *   .build();
 *
 * // Read phase (immutable)
 * map.get("a");           // 1
 * map.has("b");           // true
 * for (const [k, v] of map) { console.log(k, v); }
 *
 * // Copy-on-write
 * const extended = map.toBuilder().set("c", 3).build();
 * ```
 *
 * ### Layer 1: Registry (With Lazy Support)
 *
 * ```typescript
 * import { createRegistryBuilder, type Registry } from "@eser/standards/registry";
 *
 * // Build phase (mutable)
 * const builder = createRegistryBuilder<string, Item>();
 * builder
 *   .set("item-a", itemAInstance)
 *   .setLazy("item-b", () => createItemB());
 *
 * // Seal phase (immutable)
 * const registry = builder.build();
 *
 * // Read operations
 * registry.get("item-a");     // Item | undefined
 * registry.has("item-b");     // boolean
 * registry.isLazy("item-b");  // true
 *
 * // Copy-on-write modification
 * const extended = registry
 *   .toBuilder()
 *   .set("item-c", newInstance)
 *   .build();
 * ```
 *
 * ## Type-Safe Keys
 *
 * Define your own typed registry interface for compile-time key safety:
 *
 * ```typescript
 * interface MyRegistry {
 *   "item-a": ItemA;
 *   "item-b": ItemB;
 * }
 *
 * const builder = createRegistryBuilder<keyof MyRegistry, MyRegistry[keyof MyRegistry]>();
 * ```
 *
 * ## Indexed Registry (Multi-Key Lookup)
 *
 * ```typescript
 * import { createIndexedRegistryBuilder, createExtensionIndex } from "@eser/standards/registry";
 *
 * const builder = createIndexedRegistryBuilder<string, Format>([
 *   createExtensionIndex("byExtension", (f) => f.extensions),
 * ]);
 *
 * builder.set("json", { name: "json", extensions: [".json"] });
 * const registry = builder.build();
 *
 * registry.get("json");                        // By name
 * registry.getByIndex("byExtension", ".json"); // By extension
 * ```
 *
 * ## Bitmap Matching (Custom Flags)
 *
 * Create your own bitmap matcher for O(1) flag matching:
 *
 * ```typescript
 * import { createBitmapMatcher } from "@eser/standards/registry";
 *
 * // Consumer defines their own domain-specific mapping
 * const FlagBits = {
 *   optionA: 1 << 0,
 *   optionB: 1 << 1,
 *   optionC: 1 << 2,
 * } as const;
 *
 * const matcher = createBitmapMatcher(FlagBits);
 * const bitmap = matcher.toBitmap(["optionA", "optionB"]);
 * matcher.match(0b01, 0b11);    // true (any match)
 * matcher.matchAll(0b11, 0b11); // true (all match)
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Core types
  EntryDescriptor,
  Factory,
  // Indexed registry
  IndexConfig,
  IndexedRegistry,
  IndexedRegistryBuilder,
  Lifetime,
  // Registry interfaces
  Registry,
  RegistryBuilder,
  RegistryItem,
  // Type registry pattern utilities
  RegistryKeys,
  RegistryValue,
} from "./types.ts";

// =============================================================================
// ImmutableMap Exports (Layer 0 - Core Primitive)
// =============================================================================

export type { ImmutableMap, ImmutableMapBuilder } from "./immutable-map.ts";
export { createMap, createMapBuilder, EMPTY_MAP } from "./immutable-map.ts";

// =============================================================================
// Builder Exports
// =============================================================================

export {
  createRegistryBuilder,
  fromEntries,
  mergeBuilders,
} from "./builder.ts";

// =============================================================================
// Registry Exports
// =============================================================================

export { createRegistry, EMPTY_REGISTRY } from "./registry.ts";

// =============================================================================
// Indexed Registry Exports
// =============================================================================

export {
  createExtensionIndex,
  createIndexedRegistryBuilder,
} from "./indexed.ts";

// =============================================================================
// Performance Utilities
// =============================================================================

export {
  type Bitmap,
  type BitmapMatcher,
  // Function parameter caching
  clearParameterCache,
  // Bitmap matching (generic)
  createBitmapMatcher,
  // Array utilities
  freezeArray,
  getFunctionParameters,
  // Lazy initialization
  lazy,
  lazyAsync,
  memoizeArray,
  // Parallel initialization
  parallelImport,
  parallelImportModules,
} from "./performance.ts";
