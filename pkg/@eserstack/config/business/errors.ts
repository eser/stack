// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export class ConfigError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.cause = cause;
  }
}

export const CONFIG_LOAD_FAILED = "CONFIG_LOAD_FAILED";
export const CONFIG_PARSE_ENV_FILE_FAILED = "CONFIG_PARSE_ENV_FILE_FAILED";
export const CONFIG_PARSE_JSON_FILE_FAILED = "CONFIG_PARSE_JSON_FILE_FAILED";
export const CONFIG_PARSE_JSON_STRING_FAILED = "CONFIG_PARSE_JSON_STRING_FAILED";
