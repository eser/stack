// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Output target factories for directing formatted text to various destinations.
 *
 * Follows the same factory pattern as `@eser/logging/sinks.ts`:
 * - `getConsoleTarget()` ↔ `getConsoleSink()`
 * - `getStreamTarget()` ↔ `getStreamSink()`
 * - `getTestTarget()` ↔ `getTestSink()`
 * - `nullTarget` ↔ `nullSink`
 * - `getMultiplexTarget()` ↔ `multiplexSink()`
 *
 * @module
 */

import type { FormattedLine } from "./formatters.ts";
import type { OutputTarget } from "./types.ts";

/**
 * Console output target — writes to console.log (stdout) or console.error (stderr).
 * This is the default target, providing backward compatibility.
 */
export const getConsoleTarget = (): OutputTarget => {
  return (line: string, channel = "stdout"): void => {
    if (channel === "stderr") {
      console.error(line);
    } else {
      console.log(line);
    }
  };
};

/**
 * WritableStream output target — writes to a Web Streams WritableStream.
 * Supports backpressure via `writer.ready`.
 *
 * Follows the same pattern as `getStreamSink()` in `@eser/logging/sinks.ts`.
 *
 * @param stream - Primary output stream (receives both stdout and stderr unless stderrStream is provided)
 * @param options - Optional separate stderr stream
 */
export const getStreamTarget = (
  stream: WritableStream<Uint8Array>,
  options: { stderrStream?: WritableStream<Uint8Array> } = {},
): OutputTarget => {
  const encoder = new TextEncoder();
  const { stderrStream } = options;

  return async (line: string, channel = "stdout"): Promise<void> => {
    const targetStream = channel === "stderr" && stderrStream !== undefined
      ? stderrStream
      : stream;
    const writer = targetStream.getWriter();
    try {
      await writer.ready;
      await writer.write(encoder.encode(line + "\n"));
    } finally {
      writer.releaseLock();
    }
  };
};

/**
 * String buffer target — collects output into an array (for testing).
 * Follows the same pattern as `getTestSink()` in `@eser/logging/sinks.ts`.
 */
export const getTestTarget = (): {
  target: OutputTarget;
  lines: FormattedLine[];
  output: () => string;
  clear: () => void;
} => {
  const lines: FormattedLine[] = [];

  const target: OutputTarget = (line: string, channel = "stdout"): void => {
    lines.push({ line, channel });
  };

  return {
    target,
    lines,
    output: () => lines.map((l) => l.line).join("\n"),
    clear: () => {
      lines.length = 0;
    },
  };
};

/**
 * Null target — discards all output (for silent operation).
 * Follows `nullSink` from `@eser/logging/sinks.ts`.
 */
export const nullTarget: OutputTarget = (
  _line: string,
  _channel?: "stdout" | "stderr",
): void => {
  // Intentionally empty
};

/**
 * Multiplex target — writes to multiple targets simultaneously.
 * Follows `multiplexSink` from `@eser/logging/sinks.ts`.
 */
export const getMultiplexTarget = (
  ...targets: OutputTarget[]
): OutputTarget => {
  return async (
    line: string,
    channel: "stdout" | "stderr" = "stdout",
  ): Promise<void> => {
    await Promise.all(targets.map((t) => t(line, channel)));
  };
};

/**
 * Emit an array of FormattedLines through an OutputTarget.
 *
 * Returns `void` when all targets are synchronous (console),
 * `Promise<void>` when any target is asynchronous (stream).
 */
export const emitLines = (
  lines: FormattedLine[],
  target: OutputTarget,
): void | Promise<void> => {
  const results = lines.map((l) => target(l.line, l.channel));
  const asyncResults = results.filter(
    (r): r is Promise<void> => r instanceof Promise,
  );
  if (asyncResults.length > 0) {
    return Promise.all(asyncResults).then(() => undefined);
  }
};
