// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * XDG Base Directory Specification utilities.
 *
 * Provides cross-platform directory resolution following XDG conventions on Linux
 * and platform-specific conventions on macOS and Windows.
 *
 * @example
 * ```typescript
 * import * as xdg from "@eser/cache/xdg";
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

import * as standardsRuntime from "@eser/standards/runtime";
import type { AppIdentifier } from "./primitives.ts";

/**
 * Gets the XDG cache home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_CACHE_HOME` or `~/.cache`
 * - macOS: `~/Library/Caches`
 * - Windows: `%LOCALAPPDATA%` or `~/AppData/Local`
 *
 * @returns Absolute path to cache home directory
 */
export const getXdgCacheHome = (): string => {
  const platform = standardsRuntime.getPlatform();
  const homedir = standardsRuntime.getHomedir();

  if (platform === "darwin") {
    return standardsRuntime.runtime.path.join(homedir, "Library", "Caches");
  }

  if (platform === "windows") {
    const localAppData = standardsRuntime.runtime.env.get("LOCALAPPDATA");
    if (localAppData) {
      return localAppData;
    }
    return standardsRuntime.runtime.path.join(homedir, "AppData", "Local");
  }

  // Linux/Unix: Use XDG_CACHE_HOME or default
  const xdgCacheHome = standardsRuntime.runtime.env.get("XDG_CACHE_HOME");
  if (xdgCacheHome) {
    return xdgCacheHome;
  }

  return standardsRuntime.runtime.path.join(homedir, ".cache");
};

/**
 * Gets the XDG data home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_DATA_HOME` or `~/.local/share`
 * - macOS: `~/Library/Application Support`
 * - Windows: `%LOCALAPPDATA%` or `~/AppData/Local`
 *
 * @returns Absolute path to data home directory
 */
export const getXdgDataHome = (): string => {
  const platform = standardsRuntime.getPlatform();
  const homedir = standardsRuntime.getHomedir();

  if (platform === "darwin") {
    return standardsRuntime.runtime.path.join(
      homedir,
      "Library",
      "Application Support",
    );
  }

  if (platform === "windows") {
    const localAppData = standardsRuntime.runtime.env.get("LOCALAPPDATA");
    if (localAppData) {
      return localAppData;
    }
    return standardsRuntime.runtime.path.join(homedir, "AppData", "Local");
  }

  // Linux/Unix: Use XDG_DATA_HOME or default
  const xdgDataHome = standardsRuntime.runtime.env.get("XDG_DATA_HOME");
  if (xdgDataHome) {
    return xdgDataHome;
  }

  return standardsRuntime.runtime.path.join(homedir, ".local", "share");
};

/**
 * Gets the XDG config home directory.
 *
 * Resolution order:
 * - Linux: `$XDG_CONFIG_HOME` or `~/.config`
 * - macOS: `~/Library/Preferences`
 * - Windows: `%APPDATA%` or `~/AppData/Roaming`
 *
 * @returns Absolute path to config home directory
 */
export const getXdgConfigHome = (): string => {
  const platform = standardsRuntime.getPlatform();
  const homedir = standardsRuntime.getHomedir();

  if (platform === "darwin") {
    return standardsRuntime.runtime.path.join(
      homedir,
      "Library",
      "Preferences",
    );
  }

  if (platform === "windows") {
    const appData = standardsRuntime.runtime.env.get("APPDATA");
    if (appData) {
      return appData;
    }
    return standardsRuntime.runtime.path.join(homedir, "AppData", "Roaming");
  }

  // Linux/Unix: Use XDG_CONFIG_HOME or default
  const xdgConfigHome = standardsRuntime.runtime.env.get("XDG_CONFIG_HOME");
  if (xdgConfigHome) {
    return xdgConfigHome;
  }

  return standardsRuntime.runtime.path.join(homedir, ".config");
};

/**
 * Gets the application-specific cache directory.
 *
 * The directory structure depends on whether an organization is specified:
 * - With org: `{cache_home}/{org}/{name}`
 * - Without org: `{cache_home}/{name}`
 *
 * @param app - Application identifier
 * @returns Absolute path to application cache directory
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
export const getAppCacheDir = (app: AppIdentifier): string => {
  const cacheHome = getXdgCacheHome();

  if (app.org) {
    return standardsRuntime.runtime.path.join(cacheHome, app.org, app.name);
  }

  return standardsRuntime.runtime.path.join(cacheHome, app.name);
};

/**
 * Gets a versioned path within the application cache.
 *
 * The version is normalized to always include a 'v' prefix for consistency.
 *
 * @param app - Application identifier
 * @param version - Version string (e.g., "1.0.0" or "v1.0.0")
 * @param name - Name of the cached item
 * @returns Absolute path to the versioned cache location
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
): string => {
  const appCacheDir = getAppCacheDir(app);

  // Normalize version to always have 'v' prefix
  const normalizedVersion = version.startsWith("v") ? version : `v${version}`;

  return standardsRuntime.runtime.path.join(
    appCacheDir,
    normalizedVersion,
    name,
  );
};
