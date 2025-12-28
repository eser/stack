// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Output utilities for CLI applications.
 * Provides formatted console output functions.
 */

import { c } from "./colors.ts";

/**
 * Print a section header with underline.
 *
 * @param title - Section title
 *
 * @example
 * ```typescript
 * printSection("Configuration");
 * // Outputs:
 * //
 * // Configuration
 * // ─────────────
 * ```
 */
export const printSection = (title: string): void => {
  console.log();
  console.log(c.bold(title));
  console.log(c.gray("─".repeat(title.length)));
};

/**
 * Print a success message with checkmark.
 *
 * @param message - Success message
 * @param details - Optional details (displayed dimmed below message)
 */
export const printSuccess = (
  message: string,
  details: string | null = null,
): void => {
  console.log(c.success("✓") + " " + message);
  if (details !== null) {
    console.log(c.dim("  " + details));
  }
};

/**
 * Print an error message with X mark.
 *
 * @param message - Error message
 * @param details - Optional details (displayed dimmed below message)
 */
export const printError = (
  message: string,
  details: string | null = null,
): void => {
  console.error(c.error("✗") + " " + message);
  if (details !== null) {
    console.error(c.dim("  " + details));
  }
};

/**
 * Print a warning message with warning symbol.
 *
 * @param message - Warning message
 * @param details - Optional details (displayed dimmed below message)
 */
export const printWarning = (
  message: string,
  details: string | null = null,
): void => {
  console.warn(c.warning("⚠") + " " + message);
  if (details !== null) {
    console.warn(c.dim("  " + details));
  }
};

/**
 * Print an info message with info symbol.
 *
 * @param message - Info message
 * @param details - Optional details (displayed dimmed below message)
 */
export const printInfo = (
  message: string,
  details: string | null = null,
): void => {
  console.log(c.info("ℹ") + " " + message);
  if (details !== null) {
    console.log(c.dim("  " + details));
  }
};

/**
 * Print a labeled item (key-value pair).
 *
 * @param label - Item label
 * @param value - Item value
 */
export const printItem = (label: string, value: string): void => {
  console.log(`  ${c.dim(label + ":")} ${value}`);
};

/**
 * Print a list of next steps.
 *
 * @param steps - Array of step descriptions
 *
 * @example
 * ```typescript
 * printNextSteps([
 *   "Run 'npm install' to install dependencies",
 *   "Run 'npm start' to start the server",
 * ]);
 * ```
 */
export const printNextSteps = (steps: string[]): void => {
  console.log();
  console.log(c.bold("Next steps:"));
  console.log();
  steps.forEach((step, i) => {
    console.log(`  ${c.dim((i + 1).toString() + ".")} ${step}`);
  });
  console.log();
};

/**
 * Print text in a box for emphasis.
 *
 * @param text - Text to box (can contain newlines)
 * @param color - Color function for the border (default: brand cyan)
 *
 * @example
 * ```typescript
 * boxText("Important message!");
 * // Outputs:
 * // ╭────────────────────╮
 * // │ Important message! │
 * // ╰────────────────────╯
 * ```
 */
export const boxText = (
  text: string,
  color: (s: string) => string = c.brand,
): void => {
  if (text.length === 0) {
    return;
  }
  const lines = text.split("\n");
  const lengths = lines.map((l) => l.length);
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const border = "─".repeat(maxLength + 2);

  console.log(color("╭" + border + "╮"));
  lines.forEach((line) => {
    const padding = " ".repeat(maxLength - line.length);
    console.log(color("│") + " " + line + padding + " " + color("│"));
  });
  console.log(color("╰" + border + "╯"));
};

/**
 * Clear the terminal screen.
 */
export const clearTerminal = (): void => {
  console.log("\x1Bc");
};

/**
 * Print a blank line.
 */
export const blank = (): void => {
  console.log();
};

/**
 * Print a horizontal rule.
 *
 * @param width - Width of the rule (default: 40)
 * @param char - Character to use (default: ─)
 */
export const printRule = (width = 40, char = "─"): void => {
  console.log(c.dim(char.repeat(width)));
};

/**
 * Print a table of key-value pairs.
 *
 * @param items - Object with key-value pairs
 * @param options - Table options
 *
 * @example
 * ```typescript
 * printTable({
 *   "Name": "my-project",
 *   "Version": "1.0.0",
 *   "License": "MIT",
 * });
 * ```
 */
export const printTable = (
  items: Record<string, string>,
  options: { indent?: number; labelWidth?: number } = {},
): void => {
  const entries = Object.entries(items);
  if (entries.length === 0) {
    return;
  }
  const { indent = 2, labelWidth } = options;
  const prefix = " ".repeat(indent);
  const keys = Object.keys(items);
  const maxLabelLength = labelWidth ??
    (keys.length > 0 ? Math.max(...keys.map((k) => k.length)) : 0);

  for (const [label, value] of entries) {
    const paddedLabel = label.padEnd(maxLabelLength);
    console.log(`${prefix}${c.dim(paddedLabel + ":")} ${value}`);
  }
};
