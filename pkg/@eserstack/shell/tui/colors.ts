// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal utility functions.
 *
 * Color/style formatting has moved to `@eserstack/streams/span`.
 * Only runtime detection utilities remain here.
 */

import { runtime } from "@eserstack/standards/cross-runtime";

/** Remove ANSI color and style (SGR) sequences from `s`. */
export const stripAnsi = (s: string): string =>
  // SGR sequences start with the ESC control character.
  // oxlint-disable-next-line no-control-regex
  s.replace(/\x1b\[[0-9;]*m/g, "");

// Memoized color support check (lazy initialization)
let colorSupportCached: boolean | null = null;

/**
 * Check if terminal supports colors.
 * Result is memoized after first call for performance.
 */
export const supportsColor = (): boolean => {
  if (colorSupportCached !== null) {
    return colorSupportCached;
  }

  try {
    colorSupportCached = runtime.process.isTerminal("stdout");
  } catch {
    colorSupportCached = false;
  }

  return colorSupportCached;
};
