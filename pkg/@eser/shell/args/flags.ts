// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Flag parsing utilities
 *
 * @module
 */

import type * as cliParseArgs from "@std/cli/parse-args";
import type { FlagDef, FlagType } from "./types.ts";

/**
 * Build parseArgs options from flag definitions
 */
export const buildParseOptions = (
  flags: readonly FlagDef[],
): {
  boolean: string[];
  string: string[];
  alias: Record<string, string>;
  default: Record<string, unknown>;
} => {
  const boolean: string[] = [];
  const string: string[] = [];
  const alias: Record<string, string> = {};
  const defaultValues: Record<string, unknown> = {};

  for (const flag of flags) {
    if (flag.type === "boolean") {
      boolean.push(flag.name);
    } else {
      string.push(flag.name);
    }

    if (flag.short !== undefined) {
      alias[flag.short] = flag.name;
    }

    if (flag.default !== undefined) {
      defaultValues[flag.name] = flag.default;
    }
  }

  return {
    boolean,
    string,
    alias,
    default: defaultValues,
  };
};

/**
 * Convert parsed value to the expected type
 */
export const coerceValue = (
  value: unknown,
  type: FlagType,
): unknown => {
  if (value === undefined) {
    return undefined;
  }

  switch (type) {
    case "boolean":
      return Boolean(value);
    case "number":
      return typeof value === "string" ? Number(value) : value;
    case "string":
      return String(value);
    case "string[]":
      if (Array.isArray(value)) {
        return value.map(String);
      }
      return value !== undefined ? [String(value)] : [];
    default:
      return value;
  }
};

/**
 * Extract flag values from parsed args according to definitions
 */
export const extractFlags = (
  parsed: cliParseArgs.Args,
  flags: readonly FlagDef[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const flag of flags) {
    const value = parsed[flag.name];
    result[flag.name] = coerceValue(value, flag.type);
  }

  return result;
};

/**
 * Validate required flags are present
 */
export const validateRequiredFlags = (
  flags: Record<string, unknown>,
  definitions: readonly FlagDef[],
): string[] => {
  const errors: string[] = [];

  for (const def of definitions) {
    if (def.required === true) {
      const value = flags[def.name];
      if (value === undefined || value === "" || value === false) {
        errors.push(`Required flag --${def.name} is missing`);
      }
    }
  }

  return errors;
};
