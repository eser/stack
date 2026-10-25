// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unified package configuration reading and writing.
 *
 * This module reads and writes package.json, the one package manifest the
 * workspace keeps.
 *
 * Features:
 * - Track which file each field value originated from
 * - Update fields in the config files that contain them
 * - Synchronized version bumping
 *
 * @example
 * ```typescript
 * import * as pkg from "@eserstack/codebase/package";
 *
 * // Load package config
 * const config = await pkg.load({ baseDir: "./my-package" });
 *
 * // Read values with origin tracking
 * console.log(config.name?.value); // "@scope/my-package"
 * console.log(config.name?.origin.filepath); // "./my-package/package.json"
 *
 * // Update the version
 * await pkg.updateVersion(config, "2.0.0");
 *
 * // Update specific field
 * await pkg.updateField(config, "description", "New description");
 * ```
 *
 * @module
 */

export type {
  ConfigFileType,
  FieldMapping,
  FieldOrigin,
  LoadOptions,
  PackageConfig,
  PackageFieldName,
  RawConfigFile,
  TrackedField,
  UpdateOptions,
  UpdateResult,
  WorkspaceModule,
} from "./types.ts";
export {
  baseDirProp,
  CONFIG_FILE_PRIORITY,
  ConfigFileTypes,
  DEFAULT_FIELD_MAPPINGS,
} from "./types.ts";
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
