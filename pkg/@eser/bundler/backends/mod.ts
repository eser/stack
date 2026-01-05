// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bundler backend implementations.
 *
 * @module
 */

// Re-export core types for convenience
export type {
  BundleError,
  BundleMetafile,
  BundleOutput,
  Bundler,
  BundlerBackend,
  BundlerConfig,
  BundleResult,
  BundlerPlugin,
  BundleWarning,
  BundleWatcher,
} from "../types.ts";

export {
  createDenoBundlerBackend,
  DenoBundlerBackend,
  type DenoBundlerBackendOptions,
} from "./deno-bundler.ts";

export {
  type AdvancedChunksConfig,
  type ChunkGroup,
  createRolldownBackend,
  createRolldownWithPreset,
  RolldownBackend,
  type RolldownBackendOptions,
  RolldownPresets,
} from "./rolldown.ts";

import type { Bundler, BundlerBackend } from "../types.ts";
import {
  createDenoBundlerBackend,
  type DenoBundlerBackendOptions,
} from "./deno-bundler.ts";
import {
  createRolldownBackend,
  type RolldownBackendOptions,
} from "./rolldown.ts";

/**
 * Options for creating a bundler backend.
 */
export type CreateBundlerOptions =
  | { backend: "deno-bundler"; options?: DenoBundlerBackendOptions }
  | { backend: "rolldown"; options?: RolldownBackendOptions };

/**
 * Create a bundler backend by name.
 *
 * @param backend - Backend type ("rolldown" | "deno-bundler")
 * @param options - Backend-specific options
 * @returns Bundler instance
 *
 * @example
 * ```ts
 * // Use Rolldown (default, faster)
 * const bundler = createBundler("rolldown");
 *
 * // Use Deno Bundler (stable fallback)
 * const bundler = createBundler("deno-bundler");
 *
 * // With options
 * const bundler = createBundler("rolldown", {
 *   advancedChunks: {
 *     minSize: 20000,
 *     groups: [{ name: "vendor", test: /node_modules/, priority: 10 }]
 *   }
 * });
 * ```
 */
export function createBundler(config: CreateBundlerOptions): Bundler;
export function createBundler(
  backend?: BundlerBackend,
  options?: DenoBundlerBackendOptions | RolldownBackendOptions,
): Bundler;
export function createBundler(
  backendOrConfig?: BundlerBackend | CreateBundlerOptions,
  options?: DenoBundlerBackendOptions | RolldownBackendOptions,
): Bundler {
  // Handle config object form
  if (
    typeof backendOrConfig === "object" && backendOrConfig !== null &&
    "backend" in backendOrConfig
  ) {
    const config = backendOrConfig;
    return createBundler(config.backend, config.options);
  }

  // Handle string backend form
  const backend = backendOrConfig ?? "rolldown";

  switch (backend) {
    case "rolldown":
      return createRolldownBackend(
        options as RolldownBackendOptions,
      );
    case "deno-bundler":
      return createDenoBundlerBackend(options as DenoBundlerBackendOptions);
    default:
      throw new Error(`Unknown bundler backend: ${backend}`);
  }
}

/**
 * Get the default bundler backend.
 * Default is "rolldown" for performance.
 */
export const getDefaultBundler = (): Bundler => createBundler("rolldown");
