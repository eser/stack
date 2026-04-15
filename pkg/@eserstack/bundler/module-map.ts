// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module map types for tracking bundled modules and their chunks.
 *
 * Used by bundlers to map module IDs to their output chunks,
 * enabling features like code splitting and lazy loading.
 *
 * @module
 */

/**
 * A single module entry in the module map.
 */
export interface ModuleEntry {
  /** Unique module identifier (e.g., file path or hash). */
  readonly id: string;
  /** List of chunk filenames containing this module. */
  readonly chunks: readonly string[];
  /** Human-readable module name (e.g., export name or component name). */
  readonly name: string;
}

/**
 * Extended module entry with additional metadata.
 */
export interface ModuleEntryWithMeta extends ModuleEntry {
  /** Whether this module is async/lazy-loaded. */
  readonly async?: boolean;
  /** List of module IDs this module depends on. */
  readonly dependencies?: readonly string[];
  /** Original source file path. */
  readonly source?: string;
}

/**
 * Map of module IDs to their entries.
 */
export type ModuleMap = Readonly<Record<string, ModuleEntry>>;

/**
 * Extended module map with metadata.
 */
export type ModuleMapWithMeta = Readonly<Record<string, ModuleEntryWithMeta>>;

/**
 * SSR module map entry for server-side rendering.
 * Maps client module IDs to their server counterparts.
 */
export interface SSRModuleEntry {
  /** Module ID used on the server. */
  readonly id: string;
  /** Export name to use (default: "*" for all exports). */
  readonly name: string;
}

/**
 * Map of client module IDs to SSR module entries.
 */
export type SSRModuleMap = Readonly<Record<string, SSRModuleEntry>>;

/**
 * Create an empty module map.
 */
export const createModuleMap = (): Record<string, ModuleEntry> => ({});

/**
 * Add a module to the map.
 */
export const addModule = (
  map: Record<string, ModuleEntry>,
  entry: ModuleEntry,
): Record<string, ModuleEntry> => ({
  ...map,
  [entry.id]: entry,
});

/**
 * Get a module from the map by ID.
 */
export const getModule = (
  map: ModuleMap,
  id: string,
): ModuleEntry | undefined => map[id];

/**
 * Check if a module exists in the map.
 */
export const hasModule = (map: ModuleMap, id: string): boolean => id in map;

/**
 * Get all chunk filenames from the module map.
 */
export const getAllChunks = (map: ModuleMap): readonly string[] => {
  const chunks = new Set<string>();
  for (const entry of Object.values(map)) {
    for (const chunk of entry.chunks) {
      chunks.add(chunk);
    }
  }
  return [...chunks];
};
