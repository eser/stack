// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Types for output-target-agnostic formatting.
 *
 * @module
 */

/**
 * Output channel indicator.
 * "stdout" maps to console.log, "stderr" maps to console.error/console.warn.
 */
export type OutputChannel = "stdout" | "stderr";

/**
 * An OutputTarget receives a formatted line and writes it to a destination.
 * Can be synchronous (console) or asynchronous (WritableStream with backpressure).
 *
 * Follows the same pattern as Sink from `@eser/logging/types.ts`.
 */
export type OutputTarget = (
  line: string,
  channel?: OutputChannel,
) => void | Promise<void>;

/**
 * The complete set of formatting operations, bound to an OutputTarget.
 */
export type FormattingOutput = {
  readonly printSection: (title: string) => void | Promise<void>;
  readonly printSuccess: (
    message: string,
    details?: string | null,
  ) => void | Promise<void>;
  readonly printError: (
    message: string,
    details?: string | null,
  ) => void | Promise<void>;
  readonly printWarning: (
    message: string,
    details?: string | null,
  ) => void | Promise<void>;
  readonly printInfo: (
    message: string,
    details?: string | null,
  ) => void | Promise<void>;
  readonly printItem: (
    label: string,
    value: string,
  ) => void | Promise<void>;
  readonly printNextSteps: (steps: string[]) => void | Promise<void>;
  readonly boxText: (
    text: string,
    color?: (s: string) => string,
  ) => void | Promise<void>;
  readonly clearTerminal: () => void | Promise<void>;
  readonly blank: () => void | Promise<void>;
  readonly printRule: (
    width?: number,
    char?: string,
  ) => void | Promise<void>;
  readonly printTable: (
    items: Record<string, string>,
    options?: { indent?: number; labelWidth?: number },
  ) => void | Promise<void>;
};
