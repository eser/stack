// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsonc from "@std/jsonc";
import * as toml from "@std/toml";
import * as yaml from "@eemeli/yaml";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as fileSearch from "./file-search.ts";
import * as primitives from "./primitives.ts";

const FileFormatNames: Record<primitives.FileFormat, string> = {
  [primitives.FileFormats.Unknown]: "unknown",
  [primitives.FileFormats.EnvironmentFile]: "environment",
  [primitives.FileFormats.Json]: "JSON",
  [primitives.FileFormats.JsonWithComments]: "JSONC",
  [primitives.FileFormats.Toml]: "TOML",
  [primitives.FileFormats.Yaml]: "YAML",
};

/**
 * Thrown when a configuration file cannot be parsed in its format. The message
 * names the format and the file, and `cause` holds the parser's error.
 */
export class ConfigParseError extends Error {
  /** The path to the file that failed to parse */
  readonly filepath: string;
  /** The format that was attempted */
  readonly format: primitives.FileFormat;

  /**
   * Creates the error.
   *
   * @param filepath - The file that failed to parse
   * @param format - The format it was parsed as
   * @param cause - The parser's error
   */
  constructor(filepath: string, format: primitives.FileFormat, cause: Error) {
    super(
      `Failed to parse ${
        FileFormatNames[format] ?? "unknown"
      } file "${filepath}": ${cause.message}`,
      { cause },
    );
    this.name = "ConfigParseError";
    this.filepath = filepath;
    this.format = format;
  }
}

/**
 * Locates a configuration file in a directory hierarchy.
 *
 * @param baseDir - The directory to start searching from
 * @param filenames - Array of filenames to search for (in priority order)
 * @param searchParents - Whether to search parent directories
 * @returns The path to the first found file, or undefined if not found
 */
export const locate = async (
  baseDir: string,
  filenames: Array<string>,
  searchParents = false,
): Promise<string | undefined> => {
  return await fileSearch.searchFileHierarchy(baseDir, filenames, {
    searchParents,
  });
};

/**
 * Picks the format of a configuration file from its extension: `.json`,
 * `.jsonc`, `.yaml` or `.yml`, `.toml` and `.env`.
 *
 * @param filepath - The file path
 * @returns The format, or `FileFormats.Unknown` for any other extension
 */
export const getFileFormat = (filepath: string): primitives.FileFormat => {
  const ext = runtime.path.extname(filepath);

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

/** The parsed content of a configuration file, with its path and format. */
export type ParseResult<T> = {
  /** The parsed content; `undefined` when the format is unknown */
  content: T | undefined;
  /** The file that was read; `undefined` when no file was found */
  filepath: string | undefined;
  /** The format the file was parsed as */
  format: primitives.FileFormat;
};

/**
 * Parses a configuration file in the specified format.
 *
 * @param filepath - Path to the configuration file
 * @param format - Optional format override (auto-detected from extension if not provided)
 * @returns The parsed content, filepath, and format
 * @throws {ConfigParseError} If the file cannot be parsed in the expected format
 */
export const parse = async <T>(
  filepath: string,
  format?: primitives.FileFormat,
): Promise<ParseResult<T>> => {
  const formatFinal = format ?? getFileFormat(filepath);

  const textContent = await runtime.fs.readTextFile(filepath);

  try {
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
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigParseError(filepath, formatFinal, error);
    }
    throw new ConfigParseError(filepath, formatFinal, new Error(String(error)));
  }
};

/** The result of `load()`: the same shape as `ParseResult`. */
export type LoadResult<T> = ParseResult<T>;

/**
 * Finds the first of `filenames` in `baseDir` (and, when `searchParents` is
 * set, in its parent directories) and parses it.
 *
 * @param baseDir - The directory to start searching from
 * @param filenames - The file names to look for, in priority order
 * @param forceFormat - The format to parse as; picked from the extension when
 *   absent
 * @param searchParents - Whether to search parent directories too
 * @returns The parsed content, path and format; all `undefined` or
 *   `FileFormats.Unknown` when no file was found
 * @throws {ConfigParseError} When the file cannot be parsed in its format
 *
 * @example
 * ```typescript
 * import * as file from "@eserstack/config/file";
 *
 * const result = await file.load<{ port: number }>(".", [
 *   "config.json",
 *   "config.yaml",
 * ]);
 * const port = result.content?.port ?? 8080;
 * ```
 */
export const load = async <T>(
  baseDir: string,
  filenames: Array<string>,
  forceFormat?: primitives.FileFormat,
  searchParents = false,
): Promise<LoadResult<T>> => {
  const filepath = await locate(baseDir, filenames, searchParents);

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
