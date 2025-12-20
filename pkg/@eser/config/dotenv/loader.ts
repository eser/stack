// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as dotenv from "@std/dotenv";
import { NotFoundError, runtime } from "@eser/standards/runtime";
import { defaultEnvValue, env, type EnvMap, envVars } from "./base.ts";

/**
 * Default maximum file size for .env files (1MB).
 * This prevents DoS attacks via excessively large .env files.
 */
export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

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

// type definitions
export type LoaderOptions = {
  baseDir: string;
  env: string | undefined;
  envVars: string[];
  defaultEnvValue: string;

  loadProcessEnv: boolean;

  /**
   * Maximum file size for .env files in bytes.
   * Defaults to DEFAULT_MAX_FILE_SIZE (1MB).
   * Set to Infinity to disable the limit (not recommended).
   */
  maxFileSize: number;
};

// public functions
export const parseEnvString = (
  rawDotenv: string,
): ReturnType<typeof dotenv.parse> => {
  return dotenv.parse(rawDotenv);
};

/**
 * Parses environment variables from a file.
 *
 * @param filepath - Path to the .env file
 * @param maxFileSize - Maximum allowed file size in bytes (defaults to DEFAULT_MAX_FILE_SIZE)
 * @returns Parsed environment variables as key-value pairs
 * @throws {EnvFileTooLargeError} If the file exceeds the maximum size limit
 */
export const parseEnvFromFile = async (
  filepath: string,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
): Promise<ReturnType<typeof parseEnvString>> => {
  try {
    // Check file size before reading to prevent memory exhaustion
    const stat = await runtime.fs.stat(filepath);

    if (stat.size > maxFileSize) {
      throw new EnvFileTooLargeError(filepath, stat.size, maxFileSize);
    }

    const data = await runtime.fs.readFile(filepath);
    const decoded = new TextDecoder("utf-8").decode(data);
    const escaped = decodeURIComponent(decoded);

    const result = parseEnvString(escaped);

    return result;
  } catch (e) {
    if (e instanceof NotFoundError) {
      return {};
    }

    throw e;
  }
};

const getEnvVar = (
  sysVars: Record<string, string>,
  defaultValue: string,
): string => {
  for (const envVar of envVars) {
    if (envVar in sysVars) {
      return envVar;
    }
  }

  return defaultValue;
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
 */
export const load = async (
  options?: Partial<LoaderOptions>,
): Promise<EnvMap> => {
  const options_: LoaderOptions = Object.assign(
    {
      baseDir: ".",
      env: undefined,
      envVars: envVars,
      defaultEnvValue: defaultEnvValue,

      loadProcessEnv: true,
      maxFileSize: DEFAULT_MAX_FILE_SIZE,
    },
    options,
  );

  const sysVars = runtime.env.toObject();
  const envName = options_.env ?? getEnvVar(sysVars, options_.defaultEnvValue);

  const vars = new Map<typeof env | string, string>();
  vars.set(env, envName);

  const envImport = (entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      vars.set(key, value);
    }
  };

  // Load .env files with size limit enforcement
  envImport(
    await parseEnvFromFile(`${options_.baseDir}/.env`, options_.maxFileSize),
  );
  envImport(
    await parseEnvFromFile(
      `${options_.baseDir}/.env.${envName}`,
      options_.maxFileSize,
    ),
  );
  if (envName !== "test") {
    envImport(
      await parseEnvFromFile(
        `${options_.baseDir}/.env.local`,
        options_.maxFileSize,
      ),
    );
  }
  envImport(
    await parseEnvFromFile(
      `${options_.baseDir}/.env.${envName}.local`,
      options_.maxFileSize,
    ),
  );

  if (options_.loadProcessEnv) {
    envImport(sysVars);
  }

  return vars;
};
