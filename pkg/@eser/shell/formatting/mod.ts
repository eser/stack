// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/shell/formatting
 *
 * Terminal formatting utilities for CLI applications.
 * Cross-runtime compatible - works in Deno, Node.js, and Bun.
 *
 * Output is target-agnostic — use `createOutput()` to bind formatting
 * to any destination (console, WritableStream, test buffer, etc.).
 *
 * For value formatters (formatDuration, formatSize, etc.), see @eser/standards/formatters.
 *
 * @example
 * ```typescript
 * import {
 *   c,
 *   createOutput,
 *   getStreamTarget,
 *   Spinner,
 * } from "@eser/shell/formatting";
 *
 * // Colors and styles
 * console.log(c.success("Operation completed!"));
 * console.log(c.brand("My CLI Tool"));
 *
 * // Formatted output (default: console)
 * const fmt = createOutput();
 * fmt.printSuccess("Config loaded", "from ./config.json");
 *
 * // Formatted output to a stream
 * const streamFmt = createOutput(getStreamTarget(responseStream));
 * streamFmt.printSuccess("Streamed!");
 *
 * // Spinner for async operations
 * const spinner = new Spinner("Loading...");
 * spinner.start();
 * await someAsyncOperation();
 * spinner.succeed("Done!");
 * ```
 */

// Colors and styles
export {
  bgBlack,
  bgBlue,
  bgCyan,
  bgGreen,
  bgMagenta,
  bgRed,
  bgWhite,
  bgYellow,
  black,
  blue,
  bold,
  brightBlue,
  brightCyan,
  brightGreen,
  brightMagenta,
  brightRed,
  brightWhite,
  brightYellow,
  c,
  cyan,
  dim,
  gray,
  green,
  italic,
  magenta,
  red,
  strikethrough,
  stripAnsi,
  supportsColor,
  underline,
  white,
  yellow,
} from "./colors.ts";

// Spinner
export { Spinner, type SpinnerOptions } from "./spinner.ts";

// Output target types and factory
export { createOutput } from "./output.ts";
export type { FormattingOutput, OutputChannel, OutputTarget } from "./types.ts";

// Output targets (sink factories)
export {
  emitLines,
  getConsoleTarget,
  getMultiplexTarget,
  getStreamTarget,
  getTestTarget,
  nullTarget,
} from "./targets.ts";

// Pure formatters (return structured data, no side effects)
export {
  formatBlank,
  formatBox,
  formatClearTerminal,
  formatError,
  formatInfo,
  formatItem,
  formatNextSteps,
  formatRule,
  formatSection,
  formatSuccess,
  formatTable,
  type FormattedLine,
  formatWarning,
} from "./formatters.ts";
