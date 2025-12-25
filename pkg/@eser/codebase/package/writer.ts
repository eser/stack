// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "@eser/standards/runtime";
import {
  type ConfigFileType,
  DEFAULT_FIELD_MAPPINGS,
  type PackageConfig,
  type PackageFieldName,
  type RawConfigFile,
  type TrackedField,
  type UpdateOptions,
  type UpdateResult,
} from "./types.ts";
import { getFilesWithField } from "./loader.ts";

/**
 * Error thrown when updating package configuration fails.
 */
export class PackageUpdateError extends Error {
  readonly filepath?: string;

  constructor(message: string, filepath?: string, cause?: Error) {
    super(message, { cause });
    this.name = "PackageUpdateError";
    this.filepath = filepath;
  }
}

/**
 * Sets a nested property value in an object using a dot-separated path.
 */
const setPropertyByPath = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) {
      continue;
    }
    if (
      !(part in current) ||
      typeof current[part] !== "object" ||
      current[part] === null
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    current[lastPart] = value;
  }
};

/**
 * Formats JSON content with consistent style.
 */
const formatJson = (content: Record<string, unknown>): string => {
  return `${JSON.stringify(content, null, 2)}\n`;
};

/**
 * Writes updated content back to a config file.
 */
const writeConfigFile = async (
  file: RawConfigFile,
  updates: Record<string, unknown>,
): Promise<void> => {
  // Clone the content to avoid mutation
  const newContent = JSON.parse(JSON.stringify(file.content)) as Record<
    string,
    unknown
  >;

  // Apply updates
  for (const [path, value] of Object.entries(updates)) {
    setPropertyByPath(newContent, path, value);
  }

  // Write back to file
  const formatted = formatJson(newContent);
  await runtime.runtime.fs.writeTextFile(file.filepath, formatted);

  // Update the in-memory representation
  // Note: We need to cast away readonly for internal mutation
  (file as { content: Record<string, unknown> }).content = newContent;
  (file as { rawText: string }).rawText = formatted;
};

/**
 * Determines which files to update based on options and field presence.
 */
const resolveTargetFiles = (
  config: PackageConfig,
  fieldName: PackageFieldName,
  options: UpdateOptions,
): RawConfigFile[] => {
  const { targetFiles = "all", createIfMissing = false } = options;

  const field = config[fieldName] as TrackedField<unknown> | undefined;

  if (targetFiles === "origin") {
    if (field === undefined) {
      const firstFile = config._loadedFiles[0];
      return createIfMissing && firstFile !== undefined ? [firstFile] : [];
    }
    const originFile = config._loadedFiles.find((f) =>
      f.filepath === field.origin.filepath
    );
    return originFile ? [originFile] : [];
  }

  if (targetFiles === "all") {
    if (!field && !createIfMissing) {
      return [];
    }

    if (!field && createIfMissing) {
      // Return all loaded files to create the field in each
      return [...config._loadedFiles];
    }

    // Return files that have this field
    return getFilesWithField(config, fieldName);
  }

  // Specific file types requested
  const requestedTypes = new Set(targetFiles);
  return config._loadedFiles.filter((f) => requestedTypes.has(f.fileType));
};

/**
 * Updates a single field across config files.
 *
 * @param config - The package config to update
 * @param fieldName - Name of the field to update
 * @param value - New value for the field
 * @param options - Update options
 * @returns Result of the update operation
 *
 * @example
 * ```typescript
 * const config = await load({ baseDir: "./pkg/@eser/config" });
 * const result = await updateField(config, "version", "1.0.0");
 * console.log(result.updated); // ["./pkg/@eser/config/deno.json", "./pkg/@eser/config/package.json"]
 * ```
 */
export const updateField = async <T>(
  config: PackageConfig,
  fieldName: PackageFieldName,
  value: T,
  options: UpdateOptions = {},
): Promise<UpdateResult> => {
  const updated: string[] = [];
  const failed: Array<{ filepath: string; reason: string }> = [];
  const skipped: string[] = [];

  const targetFiles = resolveTargetFiles(config, fieldName, options);

  if (targetFiles.length === 0) {
    return { updated, failed, skipped };
  }

  for (const file of targetFiles) {
    const propertyPath = DEFAULT_FIELD_MAPPINGS[fieldName]?.[file.fileType];

    if (!propertyPath) {
      skipped.push(file.filepath);
      continue;
    }

    try {
      await writeConfigFile(file, { [propertyPath]: value });
      updated.push(file.filepath);
    } catch (error) {
      failed.push({
        filepath: file.filepath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Update the in-memory config representation
  if (updated.length > 0) {
    const existingField = config[fieldName] as TrackedField<T> | undefined;
    if (existingField) {
      (existingField as { value: T }).value = value;
    } else {
      // Create new tracked field
      const firstUpdated = config._loadedFiles.find((f) =>
        updated.includes(f.filepath)
      );
      if (firstUpdated) {
        const propertyPath = DEFAULT_FIELD_MAPPINGS[fieldName]
          ?.[firstUpdated.fileType];
        if (propertyPath) {
          // Cast to allow assignment
          (config as Record<string, unknown>)[fieldName] = {
            value,
            origin: {
              filepath: firstUpdated.filepath,
              fileType: firstUpdated.fileType,
              propertyPath,
            },
            alternateOrigins: [],
          } as TrackedField<T>;
        }
      }
    }
  }

  return { updated, failed, skipped };
};

/**
 * Updates multiple fields at once.
 *
 * @param config - The package config to update
 * @param updates - Map of field names to new values
 * @param options - Update options
 * @returns Combined result of all update operations
 */
export const updateFields = async (
  config: PackageConfig,
  updates: Partial<Record<PackageFieldName, unknown>>,
  options: UpdateOptions = {},
): Promise<UpdateResult> => {
  const updatedSet = new Set<string>();
  const allFailed: Array<{ filepath: string; reason: string }> = [];
  const allSkipped: string[] = [];

  for (const [fieldName, value] of Object.entries(updates)) {
    const result = await updateField(
      config,
      fieldName as PackageFieldName,
      value,
      options,
    );

    for (const filepath of result.updated) {
      updatedSet.add(filepath);
    }
    allFailed.push(...result.failed);
    allSkipped.push(...result.skipped);
  }

  return {
    updated: Array.from(updatedSet),
    failed: allFailed,
    skipped: [...new Set(allSkipped)],
  };
};

/**
 * Updates the version field specifically.
 * Writes to ALL config files that have a version field.
 */
export const updateVersion = async (
  config: PackageConfig,
  newVersion: string,
  options?: Omit<UpdateOptions, "targetFiles">,
): Promise<UpdateResult> => {
  return await updateField(config, "version", newVersion, {
    ...options,
    targetFiles: "all", // Always update all files for version
  });
};

/**
 * Synchronizes a field value from its primary origin to all other files
 * that can contain this field.
 */
export const syncField = async (
  config: PackageConfig,
  fieldName: PackageFieldName,
): Promise<UpdateResult> => {
  const field = config[fieldName] as TrackedField<unknown> | undefined;

  if (field === undefined) {
    return { updated: [], failed: [], skipped: [] };
  }

  return await updateField(config, fieldName, field.value, {
    targetFiles: "all",
    createIfMissing: false,
  });
};

/**
 * Gets all files that would be updated for a given field.
 * Useful for dry-run scenarios.
 */
export const getUpdateTargets = (
  config: PackageConfig,
  fieldName: PackageFieldName,
  options: UpdateOptions = {},
): ReadonlyArray<{ filepath: string; fileType: ConfigFileType }> => {
  const targetFiles = resolveTargetFiles(config, fieldName, options);

  return targetFiles
    .filter((file) => DEFAULT_FIELD_MAPPINGS[fieldName]?.[file.fileType])
    .map((file) => ({
      filepath: file.filepath,
      fileType: file.fileType,
    }));
};
