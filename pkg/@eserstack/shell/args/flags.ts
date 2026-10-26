// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Flag parsing utilities, on `parseArgs` from `node:util`.
 *
 * `parseArgs` here runs Node's parser in its lenient mode, the way the CLIs
 * of this codebase have always read their arguments: an unknown flag is kept
 * in `values` instead of failing the command, a declared string flag given
 * without a value reads as `""`, and a declared boolean flag given as
 * `--flag=false` reads as `false`. `stopEarly` stops at the first positional,
 * so a parent command hands the rest to a subcommand untouched.
 *
 * @module
 */

import * as nodeUtil from "node:util";
import type { FlagDef, FlagType } from "./types.ts";

/** One flag known to {@link parseArgs}. */
export type ArgOption = {
  /** `boolean` flags take no value; `string` flags take one. */
  readonly type: "boolean" | "string";
  /** A single-letter alias (`-n` for `--dry-run`). */
  readonly short?: string;
  /** Collect every occurrence into an array instead of keeping the last. */
  readonly multiple?: boolean;
  /** The value when the flag is absent; its type follows `type` and `multiple`. */
  readonly default?: string | boolean | readonly string[] | readonly boolean[];
};

/** Options of {@link parseArgs}. */
export type ParseArgsOptions = {
  /** The flags the command knows, by long name. */
  readonly options?: Readonly<Record<string, ArgOption>>;
  /**
   * Stop reading flags at the first positional. That positional and every
   * argument after it land in `positionals` as given, except that the first
   * `--` is dropped.
   */
  readonly stopEarly?: boolean;
};

/** A flag value: declared flags have their declared type, unknown ones `string | boolean`. */
export type ArgValue = string | boolean | (string | boolean)[];

/** The result of {@link parseArgs}. */
export type ParsedArgs = {
  /** Flag values by long name; absent flags without a default are missing. */
  readonly values: Record<string, ArgValue | undefined>;
  /** Positional arguments, as strings. */
  readonly positionals: string[];
};

const toNodeOptions = (
  options: Readonly<Record<string, ArgOption>>,
): nodeUtil.ParseArgsOptionsConfig => {
  const config: nodeUtil.ParseArgsOptionsConfig = {};

  for (const [name, option] of Object.entries(options)) {
    config[name] = {
      type: option.type,
      ...(option.short !== undefined ? { short: option.short } : {}),
      ...(option.multiple === true ? { multiple: true } : {}),
      ...(option.default !== undefined
        ? {
            default: option.default as string | boolean | string[] | boolean[],
          }
        : {}),
    };
  }

  return config;
};

// The lenient parser reads `--name` without a value as `true` and
// `--flag=false` as the string "false"; give declared flags their own type.
const normalizeValue = (
  value: string | boolean,
  type: ArgOption["type"],
): string | boolean => {
  if (type === "string") {
    return value === true ? "" : String(value);
  }

  return value !== false && value !== "false";
};

const normalizeValues = (
  values: Record<string, ArgValue | undefined>,
  options: Readonly<Record<string, ArgOption>>,
): Record<string, ArgValue | undefined> => {
  const result: Record<string, ArgValue | undefined> = { ...values };

  for (const [name, option] of Object.entries(options)) {
    const value = result[name];
    if (value === undefined) {
      continue;
    }

    result[name] = Array.isArray(value)
      ? value.map((item) => normalizeValue(item, option.type))
      : normalizeValue(value, option.type);
  }

  return result;
};

const parseLenient = (
  args: readonly string[],
  options: Readonly<Record<string, ArgOption>>,
): { values: Record<string, ArgValue | undefined>; positionals: string[] } => {
  const parsed = nodeUtil.parseArgs({
    args: [...args],
    options: toNodeOptions(options),
    strict: false,
    allowPositionals: true,
  });

  return {
    values: parsed.values as Record<string, ArgValue | undefined>,
    positionals: parsed.positionals,
  };
};

/**
 * Parse CLI arguments with `node:util` `parseArgs` in lenient mode.
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * const { values, positionals } = shell.args.parseArgs(["--dry-run", "patch"], {
 *   options: { "dry-run": { type: "boolean", short: "n" } },
 * });
 * // values["dry-run"] === true, positionals is ["patch"]
 * ```
 */
export const parseArgs = (
  args: readonly string[],
  parseOptions: ParseArgsOptions = {},
): ParsedArgs => {
  const options = parseOptions.options ?? {};

  let flagArgs: readonly string[] = args;
  let rest: string[] = [];

  if (parseOptions.stopEarly === true) {
    const { tokens } = nodeUtil.parseArgs({
      args: [...args],
      options: toNodeOptions(options),
      strict: false,
      allowPositionals: true,
      tokens: true,
    });
    const first = tokens.find((token) => token.kind === "positional");

    if (first !== undefined) {
      flagArgs = args.slice(0, first.index);
      rest = args.slice(first.index);

      // A `--` before the first positional already ended the flags.
      const terminator = flagArgs.includes("--") ? -1 : rest.indexOf("--");
      if (terminator !== -1) {
        rest.splice(terminator, 1);
      }
    }
  }

  const parsed = parseLenient(flagArgs, options);

  return {
    values: normalizeValues(parsed.values, options),
    positionals: [...parsed.positionals, ...rest],
  };
};

/**
 * Build {@link parseArgs} options from flag definitions. `number` flags are
 * read as strings and converted by {@link extractFlags}; defaults are applied
 * there too, so a `number` default needs no string form.
 */
export const buildParseOptions = (
  flags: readonly FlagDef[],
): Record<string, ArgOption> => {
  const options: Record<string, ArgOption> = {};

  for (const flag of flags) {
    options[flag.name] = {
      type: flag.type === "boolean" ? "boolean" : "string",
      ...(flag.short !== undefined ? { short: flag.short } : {}),
      ...(flag.type === "string[]" ? { multiple: true } : {}),
    };
  }

  return options;
};

/**
 * Type coercion functions by flag type
 */
const isString = (value: unknown): value is string =>
  value !== null && value !== undefined && value.constructor === String;

const coercers: Record<FlagType, (value: unknown) => unknown> = {
  boolean: (value) => Boolean(value),
  number: (value) => (isString(value) ? Number(value) : value),
  string: (value) => String(value),
  "string[]": (value) =>
    Array.isArray(value) ? value.map(String) : [String(value)],
};

/**
 * Convert parsed value to the expected type
 */
export const coerceValue = (value: unknown, type: FlagType): unknown => {
  if (value === undefined) return undefined;
  return coercers[type]?.(value) ?? value;
};

/**
 * Extract flag values from parsed values according to definitions. An absent
 * flag takes its default; an absent boolean without a default is `false`.
 */
export const extractFlags = (
  values: Readonly<Record<string, unknown>>,
  flags: readonly FlagDef[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const flag of flags) {
    const value =
      values[flag.name] ??
      flag.default ??
      (flag.type === "boolean" ? false : undefined);
    result[flag.name] = coerceValue(value, flag.type);
  }

  return result;
};

/**
 * Parse raw CLI arguments using flag definitions.
 * High-level utility for DispatchableModule.main(args) implementations.
 * Flags that are not defined are ignored.
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * export const main = async (args?: readonly string[]) => {
 *   const { positional, flags } = shell.args.parseFlags(args ?? [], [
 *     { name: "port", short: "p", type: "number", default: 8000, description: "Server port" },
 *     { name: "verbose", type: "boolean", description: "Verbose output" },
 *   ]);
 *   const port = flags["port"] as number;
 * };
 * ```
 */
export const parseFlags = (
  args: readonly string[],
  flags: readonly FlagDef[],
  options: { readonly stopEarly?: boolean } = {},
): {
  positional: readonly string[];
  flags: Readonly<Record<string, unknown>>;
} => {
  const parsed = parseArgs(args, {
    options: buildParseOptions(flags),
    ...(options.stopEarly !== undefined
      ? { stopEarly: options.stopEarly }
      : {}),
  });

  return {
    positional: parsed.positionals,
    flags: extractFlags(parsed.values, flags),
  };
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
