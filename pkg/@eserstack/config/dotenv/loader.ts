// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `.env` loader. Go owns the dialect and the file loading
 * (`pkg/ajan/configfx/envparser`); these functions reach it through the
 * `@eserstack/ajan` bridge, the native library or its WASM build, and throw
 * or reject with the bridge's load error when neither loads.
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as ffiDotenv from "../adapters/ffi/dotenv.ts";
import * as base from "./base.ts";
import type { EnvMap } from "./base.ts";

/**
 * Default maximum file size for .env files (1MB).
 * This prevents DoS attacks via excessively large .env files.
 */
export const DEFAULT_MAX_FILE_SIZE: number = 1024 * 1024; // 1MB

/**
 * Error thrown when an .env file exceeds the maximum allowed size.
 */
export class EnvFileTooLargeError extends Error {
  /** The path to the file that exceeded the limit */
  readonly filepath: string;
  /** The actual file size in bytes */
  readonly fileSize: number;
  /** The maximum allowed size in bytes */
  readonly maxSize: number;

  /**
   * Creates the error.
   *
   * @param filepath - The file that is too large
   * @param fileSize - Its size in bytes
   * @param maxSize - The limit in bytes
   */
  constructor(filepath: string, fileSize: number, maxSize: number) {
    super(
      `Environment file "${filepath}" is too large (${fileSize} bytes). Maximum allowed size is ${maxSize} bytes.`,
    );
    this.name = "EnvFileTooLargeError";
    this.filepath = filepath;
    this.fileSize = fileSize;
    this.maxSize = maxSize;
  }
}

/** Options for `load()`. Every field is optional there. */
export type LoaderOptions = {
  /** The directory that holds the `.env` files; defaults to `"."` */
  baseDir: string;
  /** The environment name; read from `envVars` when absent */
  env: string | undefined;
  /** The variables read for the environment name, in order */
  envVars: string[];
  /** The environment name used when none of `envVars` is set */
  defaultEnvValue: string;

  /**
   * Whether process environment variables override the files; defaults to
   * `true`
   */
  loadProcessEnv: boolean;

  /**
   * Maximum file size for .env files in bytes.
   * Defaults to DEFAULT_MAX_FILE_SIZE (1MB).
   * Set to Infinity to disable the limit (not recommended).
   */
  maxFileSize: number;
};

/**
 * Parses the contents of a `.env` file. A name the file does not set expands
 * from the process environment.
 *
 * Single-quoted values stay as written, double-quoted values unescape `\n`,
 * `\r`, `\t`, `\"`, `\'` and `\\`, and unquoted values expand `${NAME}`,
 * `$NAME` and `${NAME:-default}`. A key that is not an identifier is skipped
 * with a warning.
 *
 * @param rawDotenv - The file contents
 * @returns The variables by name
 * @throws {Error} When the bridge does not load (its load error is the
 *   `cause`)
 */
export const parseEnvString = (rawDotenv: string): Record<string, string> => {
  return ffiDotenv.parseText(rawDotenv);
};

/** Turns a failed read of `filepath` into the error the loader throws. */
const failureError = (
  filepath: string,
  maxFileSize: number,
  failure: ffiDotenv.DotenvFailure,
): Error => {
  if (failure.code === "too_large") {
    return new EnvFileTooLargeError(filepath, failure.fileSize, maxFileSize);
  }

  if (failure.code === "permission_denied") {
    return new crossRuntime.PermissionDeniedError(filepath, {
      cause: new Error(failure.message),
    });
  }

  return new Error(failure.message);
};

/**
 * Parses environment variables from a file.
 *
 * @param filepath - Path to the .env file
 * @param maxFileSize - Maximum allowed file size in bytes (defaults to DEFAULT_MAX_FILE_SIZE)
 * @returns Parsed environment variables as key-value pairs
 * @throws {EnvFileTooLargeError} If the file exceeds the maximum size limit
 * @throws {Error} When the bridge does not load (its load error is the
 *   `cause`)
 */
export const parseEnvFromFile = async (
  filepath: string,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
): Promise<ReturnType<typeof parseEnvString>> => {
  const result = await ffiDotenv.readFile(filepath, maxFileSize);
  if (!result.ok) {
    throw failureError(filepath, maxFileSize, result.failure);
  }

  return result.values;
};

/**
 * Loads environment variables from .env files and process environment.
 *
 * Files are loaded in the following order (later files override earlier ones):
 * 1. .env
 * 2. .env.{environment}
 * 3. .env.local (except in test environment)
 * 4. .env.{environment}.local
 * 5. Process environment variables (if loadProcessEnv is true)
 *
 * @param options - Loader configuration options
 * @returns Map of environment variable names to values
 * @throws {EnvFileTooLargeError} If any .env file exceeds the maximum size limit
 * @throws {Error} When the bridge does not load (its load error is the
 *   `cause`)
 */
export const load = async (
  options?: Partial<LoaderOptions>,
): Promise<EnvMap> => {
  const options_: LoaderOptions = Object.assign(
    {
      baseDir: ".",
      env: undefined,
      envVars: base.envVars,
      defaultEnvValue: base.defaultEnvValue,

      loadProcessEnv: true,
      maxFileSize: DEFAULT_MAX_FILE_SIZE,
    },
    options,
  );
  // An explicit undefined takes parseEnvFromFile's default, as it did when
  // this function called it.
  const maxFileSize = options_.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  const result = await ffiDotenv.loadFiles({
    // The paths were built from a template string, so they read as one.
    baseDir: `${options_.baseDir}`,
    env: options_.env,
    envVars: options_.envVars,
    defaultEnvValue: options_.defaultEnvValue,
    loadProcessEnv: options_.loadProcessEnv,
    maxFileSize,
  });

  if (!result.ok) {
    throw failureError(result.filepath, maxFileSize, result.failure);
  }

  const vars = new Map<typeof base.env | string, string>();
  vars.set(base.env, result.envName);
  for (const [key, value] of result.entries) {
    vars.set(key, value);
  }

  return vars;
};
