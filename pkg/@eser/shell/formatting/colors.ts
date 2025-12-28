// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Minimal ANSI color utilities for CLI applications.
 * Cross-runtime compatible - works in Deno, Node.js, and Bun.
 */

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

// Text styles
export const bold = (s: string): string => `${ESC}1m${s}${RESET}`;
export const dim = (s: string): string => `${ESC}2m${s}${RESET}`;
export const italic = (s: string): string => `${ESC}3m${s}${RESET}`;
export const underline = (s: string): string => `${ESC}4m${s}${RESET}`;
export const strikethrough = (s: string): string => `${ESC}9m${s}${RESET}`;

// Foreground colors
export const black = (s: string): string => `${ESC}30m${s}${RESET}`;
export const red = (s: string): string => `${ESC}31m${s}${RESET}`;
export const green = (s: string): string => `${ESC}32m${s}${RESET}`;
export const yellow = (s: string): string => `${ESC}33m${s}${RESET}`;
export const blue = (s: string): string => `${ESC}34m${s}${RESET}`;
export const magenta = (s: string): string => `${ESC}35m${s}${RESET}`;
export const cyan = (s: string): string => `${ESC}36m${s}${RESET}`;
export const white = (s: string): string => `${ESC}37m${s}${RESET}`;
export const gray = (s: string): string => `${ESC}90m${s}${RESET}`;

// Bright foreground colors
export const brightRed = (s: string): string => `${ESC}91m${s}${RESET}`;
export const brightGreen = (s: string): string => `${ESC}92m${s}${RESET}`;
export const brightYellow = (s: string): string => `${ESC}93m${s}${RESET}`;
export const brightBlue = (s: string): string => `${ESC}94m${s}${RESET}`;
export const brightMagenta = (s: string): string => `${ESC}95m${s}${RESET}`;
export const brightCyan = (s: string): string => `${ESC}96m${s}${RESET}`;
export const brightWhite = (s: string): string => `${ESC}97m${s}${RESET}`;

// Background colors
export const bgBlack = (s: string): string => `${ESC}40m${s}${RESET}`;
export const bgRed = (s: string): string => `${ESC}41m${s}${RESET}`;
export const bgGreen = (s: string): string => `${ESC}42m${s}${RESET}`;
export const bgYellow = (s: string): string => `${ESC}43m${s}${RESET}`;
export const bgBlue = (s: string): string => `${ESC}44m${s}${RESET}`;
export const bgMagenta = (s: string): string => `${ESC}45m${s}${RESET}`;
export const bgCyan = (s: string): string => `${ESC}46m${s}${RESET}`;
export const bgWhite = (s: string): string => `${ESC}47m${s}${RESET}`;

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

/**
 * Semantic color utilities for CLI applications.
 * Provides consistent styling for common use cases.
 */
export const c = {
  // Brand colors
  brand: (text: string): string => cyan(text),
  brandBold: (text: string): string => bold(cyan(text)),

  // Status colors
  success: (text: string): string => green(text),
  error: (text: string): string => red(text),
  warning: (text: string): string => yellow(text),
  info: (text: string): string => blue(text),

  // Text styles
  bold,
  dim,
  italic,

  // Code/paths
  code: (text: string): string => cyan(text),
  path: (text: string): string => underline(text),
  url: (text: string): string => cyan(underline(text)),
  link: (text: string): string => cyan(underline(text)),

  // Generic
  gray,
};
