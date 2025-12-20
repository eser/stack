// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Supported package config file types.
 */
export const ConfigFileTypes = {
  DenoJson: "deno.json",
  DenoJsonc: "deno.jsonc",
  JsrJson: "jsr.json",
  JsrJsonc: "jsr.jsonc",
  PackageJson: "package.json",
} as const;

export type ConfigFileType =
  typeof ConfigFileTypes[keyof typeof ConfigFileTypes];

/**
 * Priority order for config files (lower index = higher priority).
 */
export const CONFIG_FILE_PRIORITY: ReadonlyArray<ConfigFileType> = [
  ConfigFileTypes.DenoJson,
  ConfigFileTypes.DenoJsonc,
  ConfigFileTypes.JsrJson,
  ConfigFileTypes.JsrJsonc,
  ConfigFileTypes.PackageJson,
];

/**
 * Symbol used to track the base directory.
 */
export const baseDirProp = Symbol.for("baseDir");

/**
 * Common field names that can be extracted from config files.
 */
export type PackageFieldName =
  | "name"
  | "version"
  | "description"
  | "license"
  | "private"
  | "exports"
  | "workspaces";

/**
 * Field mapping - maps common field names to their property path
 * in each config file type.
 */
export type FieldMapping = {
  [K in PackageFieldName]: {
    [T in ConfigFileType]?: string;
  };
};

/**
 * Default field mappings between config file types.
 */
export const DEFAULT_FIELD_MAPPINGS: FieldMapping = {
  name: {
    "deno.json": "name",
    "deno.jsonc": "name",
    "jsr.json": "name",
    "jsr.jsonc": "name",
    "package.json": "name",
  },
  version: {
    "deno.json": "version",
    "deno.jsonc": "version",
    "jsr.json": "version",
    "jsr.jsonc": "version",
    "package.json": "version",
  },
  description: {
    "package.json": "description",
  },
  license: {
    "deno.json": "license",
    "deno.jsonc": "license",
    "package.json": "license",
  },
  private: {
    "package.json": "private",
  },
  exports: {
    "deno.json": "exports",
    "deno.jsonc": "exports",
    "jsr.json": "exports",
    "jsr.jsonc": "exports",
    "package.json": "exports",
  },
  workspaces: {
    "deno.json": "workspace",
    "deno.jsonc": "workspace",
    "package.json": "workspaces",
  },
};

/**
 * Tracks which file a field value originated from.
 */
export type FieldOrigin = {
  filepath: string;
  fileType: ConfigFileType;
  propertyPath: string;
};

/**
 * A field value with its origin information.
 */
export type TrackedField<T> = {
  value: T;
  origin: FieldOrigin;
  /**
   * Additional files that also have this field defined.
   * Values from these files were overridden by the primary origin.
   */
  alternateOrigins: ReadonlyArray<FieldOrigin>;
};

/**
 * Raw config file content with metadata.
 */
export type RawConfigFile = {
  filepath: string;
  fileType: ConfigFileType;
  content: Record<string, unknown>;
  /** Original text content for preserving formatting */
  rawText: string;
};

/**
 * Unified package configuration with tracked field origins.
 */
export type PackageConfig = {
  /** Package name (e.g., "@eser/codebase") */
  name?: TrackedField<string>;
  /** Package version (semver) */
  version?: TrackedField<string>;
  /** Package description */
  description?: TrackedField<string>;
  /** License identifier (e.g., "Apache-2.0") */
  license?: TrackedField<string>;
  /** Whether package is private */
  private?: TrackedField<boolean>;
  /** Export map */
  exports?: TrackedField<Record<string, string> | string>;
  /** Workspace members */
  workspaces?: TrackedField<ReadonlyArray<string>>;

  /** Base directory where config was loaded from */
  [baseDirProp]: string;
  /** Reference to all loaded config files for write operations */
  _loadedFiles: ReadonlyArray<RawConfigFile>;
};

/**
 * Options for loading package configuration.
 */
export type LoadOptions = {
  /** Base directory to search for config files */
  baseDir?: string;
  /** Which config file types to load (default: all) */
  includeFiles?: ReadonlyArray<ConfigFileType>;
  /** Custom field mappings (merged with defaults) */
  fieldMappings?: Partial<FieldMapping>;
  /** Whether to search parent directories */
  searchParents?: boolean;
};

/**
 * Options for updating package configuration.
 */
export type UpdateOptions = {
  /**
   * Which files to update. Default: all files that have the field.
   * - "all": Update all files containing the field
   * - "origin": Only update the primary origin file
   * - ConfigFileType[]: Update specific file types
   */
  targetFiles?: "all" | "origin" | ReadonlyArray<ConfigFileType>;
  /** Whether to create the field in files that don't have it */
  createIfMissing?: boolean;
};

/**
 * Result of an update operation.
 */
export type UpdateResult = {
  /** Files that were successfully updated */
  updated: ReadonlyArray<string>;
  /** Files that failed to update with reasons */
  failed: ReadonlyArray<{ filepath: string; reason: string }>;
  /** Files that were skipped (didn't have the field) */
  skipped: ReadonlyArray<string>;
};

/**
 * Represents a workspace member module with its package configuration.
 */
export type WorkspaceModule = {
  /** Package name (e.g., "@eser/config") */
  name: string;
  /** Package version (semver) */
  version: string;
  /** The full package configuration */
  config: PackageConfig;
};
