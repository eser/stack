// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Factory that creates a complete set of formatting functions bound to an OutputTarget.
 *
 * @example Console (default, backward-compatible)
 * ```ts
 * import { createOutput } from "@eser/shell/formatting";
 *
 * const out = createOutput();
 * out.printSuccess("Done!");
 * ```
 *
 * @example WritableStream (HTTP response, file, etc.)
 * ```ts
 * import { createOutput, getStreamTarget } from "@eser/shell/formatting";
 *
 * const out = createOutput(getStreamTarget(responseStream));
 * out.printSuccess("Done!"); // writes to the stream
 * ```
 *
 * @example Test buffer
 * ```ts
 * import { createOutput, getTestTarget } from "@eser/shell/formatting";
 *
 * const { target, output } = getTestTarget();
 * const out = createOutput(target);
 * out.printSuccess("Done!");
 * assert(output().includes("Done!"));
 * ```
 *
 * @module
 */

import { c } from "./colors.ts";
import * as fmt from "./formatters.ts";
import { emitLines, getConsoleTarget } from "./targets.ts";
import type { FormattingOutput, OutputTarget } from "./types.ts";

/**
 * Creates a complete set of formatting functions bound to the given OutputTarget.
 *
 * @param target - The output target (defaults to console)
 * @returns Object with all formatting methods bound to the target
 */
export const createOutput = (
  target: OutputTarget = getConsoleTarget(),
): FormattingOutput => ({
  printSection: (title) => emitLines(fmt.formatSection(title), target),
  printSuccess: (message, details = null) =>
    emitLines(fmt.formatSuccess(message, details), target),
  printError: (message, details = null) =>
    emitLines(fmt.formatError(message, details), target),
  printWarning: (message, details = null) =>
    emitLines(fmt.formatWarning(message, details), target),
  printInfo: (message, details = null) =>
    emitLines(fmt.formatInfo(message, details), target),
  printItem: (label, value) => emitLines(fmt.formatItem(label, value), target),
  printNextSteps: (steps) => emitLines(fmt.formatNextSteps(steps), target),
  boxText: (text, color = c.brand) =>
    emitLines(fmt.formatBox(text, color), target),
  clearTerminal: () => emitLines(fmt.formatClearTerminal(), target),
  blank: () => emitLines(fmt.formatBlank(), target),
  printRule: (width, char) => emitLines(fmt.formatRule(width, char), target),
  printTable: (items, options) =>
    emitLines(fmt.formatTable(items, options), target),
});
