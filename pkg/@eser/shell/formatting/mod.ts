// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/shell/formatting
 *
 * Terminal formatting utilities for CLI applications.
 * Cross-runtime compatible - works in Deno, Node.js, and Bun.
 *
 * For value formatters (formatDuration, formatSize, etc.), see @eser/standards/formatters.
 *
 * @example
 * ```typescript
 * import {
 *   c,
 *   printSection,
 *   printSuccess,
 *   printError,
 *   Spinner,
 * } from "@eser/shell/formatting";
 *
 * // Colors and styles
 * console.log(c.success("Operation completed!"));
 * console.log(c.error("Something went wrong"));
 * console.log(c.brand("My CLI Tool"));
 *
 * // Formatted output
 * printSection("Configuration");
 * printSuccess("Config loaded", "from ./config.json");
 *
 * // Spinner for async operations
 * const spinner = new Spinner("Loading...");
 * spinner.start();
 * await someAsyncOperation();
 * spinner.succeed("Done!");
 * ```
 */

export * from "./colors.ts";
export * from "./output.ts";
export * from "./spinner.ts";
