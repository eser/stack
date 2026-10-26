// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command string parsing utilities
 *
 * @module
 */

/**
 * Parse a template literal into command and arguments
 *
 * Handles:
 * - Simple space-separated arguments
 * - Quoted strings (single and double)
 * - Interpolated values (strings, numbers, arrays)
 */
export const parseCommand = (
  strings: TemplateStringsArray,
  values: unknown[],
): [string, string[]] => {
  // Build the full command string with placeholders
  const parts: string[] = [];

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    if (str !== undefined) {
      parts.push(str);
    }
    if (i < values.length) {
      const value = values[i];
      if (Array.isArray(value)) {
        // Arrays become space-separated quoted values
        parts.push(value.map((v) => escapeArg(String(v))).join(" "));
      } else if (value !== undefined && value !== null) {
        parts.push(escapeArg(String(value)));
      }
    }
  }

  const fullCommand = parts.join("").trim();
  return splitCommand(fullCommand);
};

/**
 * Escape an argument for shell safety
 */
const escapeArg = (arg: string): string => {
  // An empty interpolation must still produce a token. Emitting nothing let it
  // vanish entirely, so `cmd -p ${""} --flag` reached the process as
  // `cmd -p --flag` and the flag was swallowed as -p's value.
  if (arg === "") {
    return "''";
  }

  // If arg contains spaces or special chars, quote it
  if (/[\s"'\\$`]/.test(arg)) {
    // Use single quotes and escape any single quotes in the value
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
};

/**
 * Split a command string into command and arguments
 * Respects quoted strings
 */
const splitCommand = (input: string): [string, string[]] => {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  // Whether a token has been started at all, as distinct from having collected
  // characters. `''` is a real, empty argument and must occupy an argv slot;
  // testing `current.length > 0` alone silently dropped it, which shifted every
  // later argument down one position.
  let started = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    // A backslash inside single quotes is literal, as in POSIX. Treating it as
    // an escape here corrupted every interpolated argument containing one:
    // escapeArg wraps such an argument in single quotes, and re-parsing then ate
    // the backslash, so `\\d+` arrived at the process as `d+`. Silent, and it
    // hit exactly the prompts and regexes callers interpolate.
    if (char === "\\" && !inSingleQuote) {
      escape = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      started = true;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      started = true;
      continue;
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }

    current += char;
    started = true;
  }

  if (started) {
    tokens.push(current);
  }

  const firstToken = tokens[0];
  if (firstToken === undefined) {
    return ["", []];
  }

  return [firstToken, tokens.slice(1)];
};
