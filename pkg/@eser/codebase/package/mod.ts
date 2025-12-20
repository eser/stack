// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unified package configuration reading and writing.
 *
 * This module provides a unified interface for working with multiple
 * package configuration file formats (deno.json, deno.jsonc, jsr.json, package.json).
 *
 * Features:
 * - Load from multiple config files with priority-based merging
 * - Track which file each field value originated from
 * - Update fields across all config files that contain them
 * - Synchronized version bumping
 *
 * @example
 * ```typescript
 * import * as pkg from "@eser/codebase/package";
 *
 * // Load package config
 * const config = await pkg.load({ baseDir: "./my-package" });
 *
 * // Read values with origin tracking
 * console.log(config.name?.value); // "@scope/my-package"
 * console.log(config.name?.origin.filepath); // "./my-package/deno.json"
 *
 * // Update version across all config files
 * await pkg.updateVersion(config, "2.0.0");
 *
 * // Update specific field
 * await pkg.updateField(config, "description", "New description");
 * ```
 *
 * @module
 */

export * from "./types.ts";
export {
  getBaseDir,
  getFilesWithField,
  load,
  PackageLoadError,
  tryLoad,
} from "./loader.ts";
export {
  getUpdateTargets,
  PackageUpdateError,
  syncField,
  updateField,
  updateFields,
  updateVersion,
} from "./writer.ts";
export {
  getModule,
  getWorkspaceModules,
  loadPackageConfig,
} from "./workspace.ts";
