// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/shell/formatting
 *
 * Terminal formatting utilities for CLI applications.
 *
 * Color/style formatting and output targets have moved to `@eser/streams`.
 * Use `@eser/streams/span` for formatting and `streams.output()` for output.
 *
 * This module retains:
 * - `Spinner` — terminal spinner (uses streams.Output)
 * - `supportsColor()` — TTY detection
 * - `stripAnsi()` — ANSI code stripping utility
 *
 * @example
 * ```typescript
 * import * as streams from "@eser/streams";
 * import * as span from "@eser/streams/span";
 * import { Spinner } from "@eser/shell/formatting";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 *
 * // Formatted output
 * out.writeln(span.green("✓"), span.text(" Done!"));
 *
 * // Spinner for async operations
 * const spinner = new Spinner(out, "Loading...");
 * spinner.start();
 * await someAsyncOperation();
 * spinner.succeed("Done!");
 * ```
 */

// Terminal utilities
export { stripAnsi, supportsColor } from "./colors.ts";

// Spinner
export { Spinner, type SpinnerOptions } from "./spinner.ts";
