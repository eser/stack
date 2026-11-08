// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * XDG Base Directory Specification utilities.
 *
 * Provides cross-platform directory resolution following XDG conventions on Linux
 * and platform-specific conventions on macOS and Windows.
 *
 * Go owns the rules (`pkg/ajan/cachefx`): every function asks it through the
 * `@eserstack/ajan` bridge, which loads synchronously on first use, and throws
 * the bridge's load error when neither the native library nor its WASM build
 * loads.
 *
 * @example
 * ```typescript
 * import * as xdg from "@eserstack/cache/xdg";
 *
 * // Get base directories
 * const cacheHome = xdg.getXdgCacheHome();
 * const dataHome = xdg.getXdgDataHome();
 * const configHome = xdg.getXdgConfigHome();
 *
 * // Get app-specific cache directory
 * const appCache = xdg.getAppCacheDir({ name: "my-cli", org: "eser" });
 * ```
 *
 * @module
 */

import type { AppIdentifier } from "./primitives.ts";
import * as host from "./host.ts";

/**
 * Gets the XDG cache home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_CACHE_HOME` or `~/.cache`
 * - macOS: `~/Library/Caches`
 * - Windows: `%LOCALAPPDATA%` or `~/AppData/Local`
 *
 * @returns Absolute path to cache home directory
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 */
export const getXdgCacheHome = (): string => host.resolvePaths({}).cacheHome;

/**
 * Gets the XDG data home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_DATA_HOME` or `~/.local/share`
 * - macOS: `~/Library/Application Support`
 * - Windows: `%LOCALAPPDATA%` or `~/AppData/Local`
 *
 * @returns Absolute path to data home directory
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 */
export const getXdgDataHome = (): string => host.resolvePaths({}).dataHome;

/**
 * Gets the XDG config home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_CONFIG_HOME` or `~/.config`
 * - macOS: `~/Library/Preferences`
 * - Windows: `%APPDATA%` or `~/AppData/Roaming`
 *
 * @returns Absolute path to config home directory
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 */
export const getXdgConfigHome = (): string => host.resolvePaths({}).configHome;

/**
 * Gets the application-specific cache directory.
 *
 * The directory structure depends on whether an organization is specified:
 * - With org: `{cache_home}/{org}/{name}`
 * - Without org: `{cache_home}/{name}`
 *
 * @param app - Application identifier
 * @returns Absolute path to application cache directory
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 *
 * @example
 * ```typescript
 * // With organization
 * getAppCacheDir({ name: "my-cli", org: "eser" });
 * // => ~/.cache/eser/my-cli
 *
 * // Without organization
 * getAppCacheDir({ name: "my-cli" });
 * // => ~/.cache/my-cli
 * ```
 */
export const getAppCacheDir = (app: AppIdentifier): string =>
  host.resolveAppPaths({ app }).appDir;

/**
 * Gets a versioned path within the application cache.
 *
 * The version is normalized to always include a 'v' prefix for consistency.
 *
 * @param app - Application identifier
 * @param version - Version string (e.g., "1.0.0" or "v1.0.0")
 * @param name - Name of the cached item
 * @returns Absolute path to the versioned cache location
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 *
 * @example
 * ```typescript
 * getVersionedCachePath({ name: "my-cli" }, "1.0.0", "binary");
 * // => ~/.cache/my-cli/v1.0.0/binary
 *
 * getVersionedCachePath({ name: "my-cli" }, "v2.0.0", "data.json");
 * // => ~/.cache/my-cli/v2.0.0/data.json
 * ```
 */
export const getVersionedCachePath = (
  app: AppIdentifier,
  version: string,
  name: string,
): string => host.resolveAppPaths({ app, version, item: name }).versionedPath;
