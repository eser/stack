// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as posix from "@std/path/posix";
import * as fileLoader from "@eser/config/file";
import { runtime } from "@eser/standards/runtime";
import {
  baseDirProp,
  CONFIG_FILE_PRIORITY,
  type ConfigFileType,
  DEFAULT_FIELD_MAPPINGS,
  type FieldMapping,
  type FieldOrigin,
  type LoadOptions,
  type PackageConfig,
  type PackageFieldName,
  type RawConfigFile,
  type TrackedField,
} from "./types.ts";

/**
 * Error thrown when loading package configuration fails.
 */
export class PackageLoadError extends Error {
  readonly filepath?: string;

  constructor(message: string, filepath?: string, cause?: Error) {
    super(message, { cause });
    this.name = "PackageLoadError";
    this.filepath = filepath;
  }
}

/**
 * Attempts to load a single config file.
 */
const tryLoadConfigFile = async (
  filepath: string,
  fileType: ConfigFileType,
): Promise<RawConfigFile | undefined> => {
  const exists = await runtime.fs.exists(filepath);
  if (exists === false) {
    return undefined;
  }

  // Verify it's a file, not a directory
  const stat = await runtime.fs.stat(filepath);
  if (stat.isFile === false) {
    return undefined;
  }

  // Read raw text
  const rawText = await runtime.fs.readTextFile(filepath);

  // Use the file loader for parsing
  const parseResult = await fileLoader.parse<Record<string, unknown>>(
    filepath,
  );
  const content = parseResult.content;

  if (content === undefined) {
    return undefined;
  }

  return {
    filepath,
    fileType,
    content,
    rawText,
  };
};

/**
 * Finds all config files in the specified directory.
 */
const findConfigFiles = async (
  baseDir: string,
  includeFiles: ReadonlyArray<ConfigFileType>,
): Promise<RawConfigFile[]> => {
  const results: RawConfigFile[] = [];

  for (const fileType of includeFiles) {
    const filepath = posix.join(baseDir, fileType);
    const loaded = await tryLoadConfigFile(filepath, fileType);
    if (loaded) {
      results.push(loaded);
    }
  }

  return results;
};

/**
 * Gets a nested property value from an object using a dot-separated path.
 */
const getPropertyByPath = (
  obj: Record<string, unknown>,
  path: string,
): unknown => {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (
      current === null || current === undefined || typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
};

/**
 * Extracts a field value from loaded config files with origin tracking.
 */
const extractField = <T>(
  fieldName: PackageFieldName,
  loadedFiles: ReadonlyArray<RawConfigFile>,
  fieldMappings: FieldMapping,
): TrackedField<T> | undefined => {
  let primaryValue: T | undefined;
  let primaryOrigin: FieldOrigin | undefined;
  const alternateOrigins: FieldOrigin[] = [];

  // Files are already in priority order
  for (const file of loadedFiles) {
    const propertyPath = fieldMappings[fieldName]?.[file.fileType];
    if (propertyPath === undefined) {
      continue;
    }

    const value = getPropertyByPath(file.content, propertyPath);
    if (value === undefined) {
      continue;
    }

    const origin: FieldOrigin = {
      filepath: file.filepath,
      fileType: file.fileType,
      propertyPath,
    };

    if (primaryValue === undefined) {
      primaryValue = value as T;
      primaryOrigin = origin;
    } else {
      alternateOrigins.push(origin);
    }
  }

  if (primaryValue === undefined || primaryOrigin === undefined) {
    return undefined;
  }

  return {
    value: primaryValue,
    origin: primaryOrigin,
    alternateOrigins,
  };
};

/**
 * Merges custom field mappings with defaults.
 */
const mergeFieldMappings = (
  customMappings?: Partial<FieldMapping>,
): FieldMapping => {
  if (customMappings === undefined) {
    return DEFAULT_FIELD_MAPPINGS;
  }

  const merged: FieldMapping = { ...DEFAULT_FIELD_MAPPINGS };

  for (const [field, mapping] of Object.entries(customMappings)) {
    merged[field as PackageFieldName] = {
      ...merged[field as PackageFieldName],
      ...mapping,
    };
  }

  return merged;
};

/**
 * Sorts include files by priority order.
 */
const sortByPriority = (
  files: ReadonlyArray<ConfigFileType>,
): ConfigFileType[] => {
  return [...files].sort(
    (a, b) => CONFIG_FILE_PRIORITY.indexOf(a) - CONFIG_FILE_PRIORITY.indexOf(b),
  );
};

/**
 * Loads and merges package configuration from multiple config files.
 *
 * @param options - Loading options
 * @returns Merged package configuration with field origin tracking
 *
 * @example
 * ```typescript
 * const config = await load({ baseDir: "./pkg/@eser/config" });
 * console.log(config.name?.value); // "@eser/config"
 * console.log(config.name?.origin.filepath); // "./pkg/@eser/config/deno.json"
 * ```
 */
export const load = async (
  options: LoadOptions = {},
): Promise<PackageConfig> => {
  const {
    baseDir = ".",
    includeFiles = CONFIG_FILE_PRIORITY,
    fieldMappings,
    searchParents = false,
  } = options;

  const mergedMappings = mergeFieldMappings(fieldMappings);
  const sortedFiles = sortByPriority(includeFiles);

  // Find and load all config files
  let searchDir = posix.resolve(baseDir);
  let loadedFiles: RawConfigFile[] = [];

  while (true) {
    loadedFiles = await findConfigFiles(searchDir, sortedFiles);

    if (loadedFiles.length > 0 || !searchParents) {
      break;
    }

    const parent = posix.dirname(searchDir);
    if (parent === searchDir) {
      break;
    }
    searchDir = parent;
  }

  if (loadedFiles.length === 0) {
    throw new PackageLoadError(
      `No config files found in ${baseDir}. Looked for: ${
        sortedFiles.join(", ")
      }`,
    );
  }

  // Extract all fields with origin tracking
  const config: PackageConfig = {
    name: extractField("name", loadedFiles, mergedMappings),
    version: extractField("version", loadedFiles, mergedMappings),
    description: extractField("description", loadedFiles, mergedMappings),
    license: extractField("license", loadedFiles, mergedMappings),
    private: extractField("private", loadedFiles, mergedMappings),
    exports: extractField("exports", loadedFiles, mergedMappings),
    workspaces: extractField("workspaces", loadedFiles, mergedMappings),
    [baseDirProp]: searchDir,
    _loadedFiles: loadedFiles,
  };

  return config;
};

/**
 * Loads package configuration, returning undefined if no config files found.
 */
export const tryLoad = async (
  options: LoadOptions = {},
): Promise<PackageConfig | undefined> => {
  try {
    return await load(options);
  } catch (error) {
    if (error instanceof PackageLoadError) {
      return undefined;
    }
    throw error;
  }
};

/**
 * Gets all files that contain a specific field.
 */
export const getFilesWithField = (
  config: PackageConfig,
  fieldName: PackageFieldName,
): RawConfigFile[] => {
  const field = config[fieldName] as TrackedField<unknown> | undefined;
  if (!field) {
    return [];
  }

  const filepaths = new Set<string>([
    field.origin.filepath,
    ...field.alternateOrigins.map((o) => o.filepath),
  ]);

  return config._loadedFiles.filter((f) => filepaths.has(f.filepath));
};

/**
 * Gets the base directory where config was loaded from.
 */
export const getBaseDir = (config: PackageConfig): string => {
  return config[baseDirProp];
};
