// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fs from "@std/fs";
import * as jsonc from "@std/jsonc";
import * as posix from "@std/path/posix";
import * as toml from "@std/toml";
import * as yaml from "@std/yaml";
import { runtime } from "@eser/standards/runtime";
import * as primitives from "./primitives.ts";

/**
 * Error thrown when parsing a configuration file fails.
 * Includes the filepath and format for better error messages.
 */
const FileFormatNames: Record<primitives.FileFormat, string> = {
  [primitives.FileFormats.Unknown]: "unknown",
  [primitives.FileFormats.EnvironmentFile]: "environment",
  [primitives.FileFormats.Json]: "JSON",
  [primitives.FileFormats.JsonWithComments]: "JSONC",
  [primitives.FileFormats.Toml]: "TOML",
  [primitives.FileFormats.Yaml]: "YAML",
};

export class ConfigParseError extends Error {
  /** The path to the file that failed to parse */
  readonly filepath: string;
  /** The format that was attempted */
  readonly format: primitives.FileFormat;

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

// TODO(@eser) introduce strategy pattern for "search parents" and "recursive search" options

export const locate = async (
  baseDir: string,
  filenames: Array<string>,
  searchParents = false,
): Promise<string | undefined> => {
  let dir = baseDir;

  while (true) {
    for (const name of filenames) {
      const filepath = posix.join(dir, name);
      const isExists = await fs.exists(filepath, { isFile: true });

      if (isExists) {
        return filepath;
      }
    }

    if (!searchParents) {
      break;
    }

    const parent = posix.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return undefined;
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
    throw new ConfigParseError(
      filepath,
      formatFinal,
      new Error(String(error)),
    );
  }
};

export type LoadResult<T> = ParseResult<T>;

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
