// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fs from "@std/fs";
import * as jsonc from "@std/jsonc";
import * as posix from "@std/path/posix";
import * as toml from "@std/toml";
import * as yaml from "@std/yaml";
import * as jsRuntime from "@eser/standards/js-runtime";
import * as primitives from "./primitives.ts";

/**
 * Validates and sanitizes a file path to prevent directory traversal attacks.
 *
 * @param filepath The file path to validate
 * @returns The sanitized path
 * @throws {Error} If the path is potentially dangerous
 */
const validateFilePath = (filepath: string): string => {
  if (typeof filepath !== "string") {
    throw new Error("File path must be a string");
  }

  if (filepath.trim() === "") {
    throw new Error("File path cannot be empty");
  }

  // Prevent directory traversal attacks
  if (filepath.includes("..")) {
    throw new Error("File path cannot contain '..' (directory traversal)");
  }

  // Prevent absolute paths outside of the base directory in most cases
  if (filepath.startsWith("/") && !filepath.startsWith(Deno.cwd())) {
    throw new Error(
      "Absolute paths outside the current working directory are not allowed",
    );
  }

  // Normalize the path to remove any potential issues
  return posix.normalize(filepath);
};

/**
 * Validates an array of filenames to ensure they are safe.
 *
 * @param filenames Array of filenames to validate
 * @returns The validated filenames
 * @throws {Error} If any filename is unsafe
 */
const validateFilenames = (filenames: Array<string>): Array<string> => {
  if (!Array.isArray(filenames)) {
    throw new Error("Filenames must be an array");
  }

  if (filenames.length === 0) {
    throw new Error("At least one filename must be provided");
  }

  return filenames.map((filename) => {
    if (typeof filename !== "string" || filename.trim() === "") {
      throw new Error("All filenames must be non-empty strings");
    }

    // Prevent directory traversal in filenames
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error("Filenames cannot contain path separators");
    }

    if (filename.includes("..")) {
      throw new Error("Filenames cannot contain '..'");
    }

    return filename.trim();
  });
};

/**
 * Search strategy for file location
 */
export enum SearchStrategy {
  /** Only search in the base directory */
  CurrentDirOnly = "current-dir-only",
  /** Search in parent directories up to root */
  SearchParents = "search-parents",
  /** Recursively search in subdirectories */
  RecursiveSearch = "recursive-search",
}

/**
 * Options for file location
 */
export type LocateOptions = {
  /** Search strategy to use */
  strategy?: SearchStrategy;
  /** Maximum depth for recursive search (only applies to RecursiveSearch strategy) */
  maxDepth?: number;
};

/**
 * Locate a file using the current directory only strategy
 */
const locateCurrentDirOnly = async (
  baseDir: string,
  filenames: Array<string>,
): Promise<string | undefined> => {
  const validatedBaseDir = validateFilePath(baseDir);
  const validatedFilenames = validateFilenames(filenames);

  for (const name of validatedFilenames) {
    const filepath = posix.join(validatedBaseDir, name);

    // Additional security check after joining paths
    const normalizedPath = validateFilePath(filepath);

    const isExists = await fs.exists(normalizedPath, { isFile: true });

    if (isExists) {
      return normalizedPath;
    }
  }

  return undefined;
};

/**
 * Locate a file using the search parents strategy
 */
const locateSearchParents = async (
  baseDir: string,
  filenames: Array<string>,
): Promise<string | undefined> => {
  let dir = baseDir;

  while (true) {
    const result = await locateCurrentDirOnly(dir, filenames);
    if (result) {
      return result;
    }

    const parent = posix.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return undefined;
};

/**
 * Locate a file using the recursive search strategy
 */
const locateRecursiveSearch = async (
  baseDir: string,
  filenames: Array<string>,
  maxDepth = 5,
): Promise<string | undefined> => {
  const searchRecursively = async (
    dir: string,
    currentDepth: number,
  ): Promise<string | undefined> => {
    if (currentDepth > maxDepth) {
      return undefined;
    }

    // Check current directory first
    const result = await locateCurrentDirOnly(dir, filenames);
    if (result) {
      return result;
    }

    // Search subdirectories
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.isDirectory) {
          const subdir = posix.join(dir, entry.name);
          const result = await searchRecursively(subdir, currentDepth + 1);
          if (result) {
            return result;
          }
        }
      }
    } catch {
      // Ignore permission errors and continue
    }

    return undefined;
  };

  return await searchRecursively(baseDir, 0);
};

export const locate = async (
  baseDir: string,
  filenames: Array<string>,
  options: LocateOptions | boolean = {},
): Promise<string | undefined> => {
  // Handle legacy boolean parameter for backward compatibility
  if (typeof options === "boolean") {
    const strategy = options
      ? SearchStrategy.SearchParents
      : SearchStrategy.CurrentDirOnly;
    options = { strategy };
  }

  const { strategy = SearchStrategy.CurrentDirOnly, maxDepth = 5 } = options;

  switch (strategy) {
    case SearchStrategy.CurrentDirOnly:
      return await locateCurrentDirOnly(baseDir, filenames);
    case SearchStrategy.SearchParents:
      return await locateSearchParents(baseDir, filenames);
    case SearchStrategy.RecursiveSearch:
      return await locateRecursiveSearch(baseDir, filenames, maxDepth);
    default:
      return await locateCurrentDirOnly(baseDir, filenames);
  }
};

export const getFileFormat = (filepath: string): primitives.FileFormat => {
  const ext = posix.extname(filepath);

  if (ext === ".json") {
    return primitives.FileFormats.Json;
  }

  if (ext === ".jsonc") {
    return primitives.FileFormats.JsonWithComments;
  }

  if (ext === ".yaml" || ext === ".yml") {
    return primitives.FileFormats.Yaml;
  }

  if (ext === ".toml") {
    return primitives.FileFormats.Toml;
  }

  if (ext === ".env") {
    return primitives.FileFormats.EnvironmentFile;
  }

  return primitives.FileFormats.Unknown;
};

export type ParseResult<T> = {
  content: T | undefined;
  filepath: string | undefined;
  format: primitives.FileFormat;
};

export const parse = async <T>(
  filepath: string,
  format?: primitives.FileFormat,
): Promise<ParseResult<T>> => {
  const formatFinal = format ?? getFileFormat(filepath);

  const textContent = await jsRuntime.current.readTextFile(filepath);

  if (formatFinal === primitives.FileFormats.Json) {
    return {
      content: JSON.parse(textContent) as T,
      filepath: filepath,
      format: formatFinal,
    };
  }

  if (formatFinal === primitives.FileFormats.JsonWithComments) {
    return {
      content: jsonc.parse(textContent) as T,
      filepath: filepath,
      format: formatFinal,
    };
  }

  if (formatFinal === primitives.FileFormats.Yaml) {
    return {
      content: yaml.parse(textContent) as T,
      filepath: filepath,
      format: formatFinal,
    };
  }

  if (formatFinal === primitives.FileFormats.Toml) {
    return {
      content: toml.parse(textContent) as T,
      filepath: filepath,
      format: formatFinal,
    };
  }

  return {
    content: undefined,
    filepath: filepath,
    format: primitives.FileFormats.Unknown,
  };
};

export type LoadResult<T> = ParseResult<T>;

export const load = async <T>(
  baseDir: string,
  filenames: Array<string>,
  forceFormat?: primitives.FileFormat,
  options?: LocateOptions | boolean,
): Promise<LoadResult<T>> => {
  const filepath = await locate(baseDir, filenames, options);

  if (filepath === undefined) {
    return {
      content: undefined,
      filepath: undefined,
      format: primitives.FileFormats.Unknown,
    };
  }

  const result = await parse<T>(filepath, forceFormat);

  return result;
};
