// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `.env` dialect of @std/dotenv 0.225 (MIT, the Deno authors), which
 * pkg/ajan/configfx/envparser reads too. @std/dotenv's own parse looks names
 * the file does not set up in a runtime global Node.js does not have, so it
 * throws there; this one takes that lookup as a parameter.
 *
 * @module
 */

const KEY_VALUE_PATTERN =
  /^\s*(?:export\s+)?(?<key>[^\s=#]+?)\s*=[ \t]*('\r?\n?(?<notInterpolated>(?:.|\r\n|\n)*?)\r?\n?'|"\r?\n?(?<interpolated>(?:[^"\\]|\\[\s\S])*?)\r?\n?"|(?<unquoted>[^\r\n#]*)) *#*.*$/gm;
const VALID_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const EXPAND_VALUE_PATTERN =
  /(\$\{(?<inBrackets>.+?)(:-(?<inBracketsDefault>.+))?\}|(?<!\\)\$(?<notInBrackets>\w+)(:-(?<notInBracketsDefault>.+))?)/g;
const ESCAPE_PATTERN = /\\[\s\S]/g;

const ESCAPES: Readonly<Record<string, string>> = {
  "\\n": "\n",
  "\\r": "\r",
  "\\t": "\t",
  '\\"': '"',
  "\\'": "'",
  "\\\\": "\\",
};

// Bounds the expansion of a value whose references expand to more
// references, as configfx/envparser does; a value that refers to itself
// would otherwise never stop.
const MAX_EXPAND_PASSES = 10;

/** Looks up a name the file does not set, such as a process variable. */
export type LookupFn = (name: string) => string | undefined;

type ExpandGroups = {
  readonly inBrackets?: string;
  readonly inBracketsDefault?: string;
  readonly notInBrackets?: string;
  readonly notInBracketsDefault?: string;
};

const unescape = (value: string): string =>
  value.replace(ESCAPE_PATTERN, (match) => ESCAPES[match] ?? match);

// A name resolves to the file's value, then to `lookup`, then to its
// default, then to "" (@std/dotenv prints "undefined" there; Go and POSIX
// shells expand to empty).
const expand = (
  value: string,
  variables: Readonly<Record<string, string>>,
  lookup: LookupFn,
): string => {
  let current = value;

  for (let pass = 0; pass < MAX_EXPAND_PASSES; pass++) {
    const next = current.replace(
      EXPAND_VALUE_PATTERN,
      (...params: unknown[]) => {
        const groups = params.at(-1) as ExpandGroups;
        const name = (groups.inBrackets ?? groups.notInBrackets)!;
        const fallback =
          groups.inBracketsDefault ?? groups.notInBracketsDefault;

        return variables[name] ?? lookup(name) ?? fallback ?? "";
      },
    );

    if (next === current) {
      break;
    }

    current = next;
  }

  return current;
};

/**
 * Parses the contents of a `.env` file.
 *
 * Single-quoted values stay as written, double-quoted values unescape `\n`,
 * `\r`, `\t`, `\"`, `\'` and `\\`, and unquoted values expand `${NAME}`,
 * `$NAME` and `${NAME:-default}`. A key that is not an identifier is skipped
 * with a warning.
 *
 * @param text - The file contents
 * @param lookup - Resolves a name the file does not set
 * @returns The variables by name
 */
export const parse = (
  text: string,
  lookup: LookupFn,
): Record<string, string> => {
  const env: Record<string, string> = Object.create(null);
  const keysToExpand: string[] = [];

  for (const match of text.matchAll(KEY_VALUE_PATTERN)) {
    const { key, interpolated, notInterpolated, unquoted } = match.groups as {
      key: string;
      interpolated?: string;
      notInterpolated?: string;
      unquoted?: string;
    };

    if (!VALID_KEY_PATTERN.test(key)) {
      // The package has no logger; @std/dotenv warned on the console too.
      // oxlint-disable-next-line no-console
      console.warn(
        `Ignored the key "${key}" as it is not a valid identifier: The key need to match the pattern ${VALID_KEY_PATTERN}.`,
      );
      continue;
    }

    if (notInterpolated !== undefined) {
      env[key] = notInterpolated;
    } else if (interpolated !== undefined) {
      env[key] = unescape(interpolated);
    } else {
      env[key] = (unquoted ?? "").trim();
      if (unquoted) {
        keysToExpand.push(key);
      }
    }
  }

  const variables = { ...env };
  for (const key of keysToExpand) {
    env[key] = expand(env[key]!, variables, lookup);
  }

  return env;
};
