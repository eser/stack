// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Helpers for the `cause` chains that kit's recipe errors carry: rendering a
 * chain for the person running a command, and finding one error type in it.
 *
 * @module
 */

import * as span from "@eserstack/streams/span";

// Bounds the walk down `cause`, so a cyclic chain cannot loop forever.
const MAX_CAUSE_DEPTH = 10;

const messageOf = (value: unknown): string =>
  value instanceof Error ? value.message : String(value);

/**
 * Renders an error and every `cause` below it, outermost first, one per line:
 * the operation that stopped, then each step down to the root error.
 *
 * Messages can quote registry and repository content, which comes from third
 * parties, so terminal control sequences are removed before they reach a
 * terminal.
 *
 * @example
 * ```typescript
 * import * as errorChain from "./error-chain.ts";
 *
 * const error = new Error("load registry x.json", {
 *   cause: new Error("No such file or directory: x.json"),
 * });
 *
 * errorChain.formatErrorChain(error);
 * // load registry x.json
 * //   caused by: No such file or directory: x.json
 * ```
 */
export const formatErrorChain = (error: unknown): string => {
  const lines = [messageOf(error)];
  let current: unknown = error;

  for (let depth = 1; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error) || current.cause === undefined) {
      break;
    }

    current = current.cause;
    lines.push(`  caused by: ${messageOf(current)}`);
  }

  return span.stripTerminalControls(lines.join("\n"));
};

/**
 * Returns the first error in the chain of `error` (itself included) that is
 * an instance of `type`, or null when the chain has none.
 */
export const findCause = <T extends Error>(
  error: unknown,
  type: abstract new (...args: never[]) => T,
): T | null => {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current instanceof type) {
      return current;
    }
    if (!(current instanceof Error)) {
      return null;
    }

    current = current.cause;
  }

  return null;
};
