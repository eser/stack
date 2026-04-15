// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ANSI rendering primitives — cursor movement, text styling, and
 * smart truncation that respects escape sequences.
 *
 * Every function is pure and returns a string. Compose them freely
 * without worrying about state.
 *
 * @module
 */

/** Move cursor to an absolute row and column (1-based). */
export const moveTo = (row: number, col: number): string =>
  `\x1b[${row};${col}H`;

/** Wrap text in bold. */
export const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`;

/** Wrap text in dim/faint. */
export const dim = (text: string): string => `\x1b[2m${text}\x1b[22m`;

/** Wrap text in green foreground. */
export const green = (text: string): string => `\x1b[32m${text}\x1b[39m`;

/** Wrap text in yellow foreground. */
export const yellow = (text: string): string => `\x1b[33m${text}\x1b[39m`;

/** Wrap text in red foreground. */
export const red = (text: string): string => `\x1b[31m${text}\x1b[39m`;

/** Wrap text in cyan foreground. */
export const cyan = (text: string): string => `\x1b[36m${text}\x1b[39m`;

/** Wrap text in white foreground. */
export const white = (text: string): string => `\x1b[37m${text}\x1b[39m`;

/** Wrap text in green background. */
export const bgGreen = (text: string): string => `\x1b[42m${text}\x1b[49m`;

/** Wrap text in blue background. */
export const bgBlue = (text: string): string => `\x1b[44m${text}\x1b[49m`;

/** Wrap text in inverse (swap foreground/background). */
export const inverse = (text: string): string => `\x1b[7m${text}\x1b[27m`;

/** Return the ANSI reset sequence. */
export const reset = (): string => "\x1b[0m";

// deno-lint-ignore no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Strip all ANSI escape codes from a string. */
export const stripAnsi = (s: string): string => s.replace(ANSI_REGEX, "");

/** Return the visible (non-ANSI) length of a string. */
export const visibleLength = (s: string): number => stripAnsi(s).length;

/**
 * Truncate a string to `maxWidth` visible characters, preserving ANSI
 * sequences that precede the cut-off point. Appends an ellipsis and
 * reset when truncation occurs.
 */
export const truncate = (text: string, maxWidth: number): string => {
  const stripped = stripAnsi(text);
  if (stripped.length <= maxWidth) return text;

  // Walk through the raw string tracking visible character count
  let visible = 0;
  let i = 0;
  const raw = text;
  while (i < raw.length && visible < maxWidth - 1) {
    if (raw[i] === "\x1b") {
      // Skip the entire ANSI sequence
      const end = raw.indexOf("m", i);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    visible++;
    i++;
  }
  return raw.slice(0, i) + "\u2026" + reset();
};
