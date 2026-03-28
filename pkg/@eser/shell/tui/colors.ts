// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal utility functions.
 *
 * Color/style formatting has moved to `@eser/streams/span`.
 * Only runtime detection utilities remain here.
 */

// Utility to strip ANSI codes
export const stripAnsi = (s: string): string =>
  // deno-lint-ignore no-control-regex
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

  // Check for common environment variables
  if (typeof globalThis.Deno !== "undefined") {
    colorSupportCached = Deno.stdout.isTerminal?.() ?? true;
  } else if (typeof globalThis.process !== "undefined") {
    colorSupportCached = globalThis.process.stdout?.isTTY ?? false;
  } else {
    colorSupportCached = false;
  }

  return colorSupportCached;
};
