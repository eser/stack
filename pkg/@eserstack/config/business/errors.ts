// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Thrown when loading configuration fails. `code` is one of the
 * `CONFIG_*_FAILED` constants and says which step failed.
 */
export class ConfigError extends Error {
  /** Which step failed, such as `CONFIG_PARSE_JSON_FILE_FAILED`. */
  readonly code: string;
  /** The error that caused this one, if any. */
  override readonly cause?: unknown;

  /**
   * Creates the error.
   *
   * @param message - What failed, with the source that failed
   * @param code - One of the `CONFIG_*_FAILED` constants
   * @param cause - The underlying error, if any
   */
  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.cause = cause;
  }
}

/** Loading failed for a reason no other code names, or the library is absent. */
export const CONFIG_LOAD_FAILED = "CONFIG_LOAD_FAILED";
/** An `env_file` source could not be parsed. */
export const CONFIG_PARSE_ENV_FILE_FAILED = "CONFIG_PARSE_ENV_FILE_FAILED";
/** A `json_file` source could not be parsed. */
export const CONFIG_PARSE_JSON_FILE_FAILED = "CONFIG_PARSE_JSON_FILE_FAILED";
/** A `json_string` source could not be parsed. */
export const CONFIG_PARSE_JSON_STRING_FAILED =
  "CONFIG_PARSE_JSON_STRING_FAILED";
