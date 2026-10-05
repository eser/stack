// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal spinner — pure functional API (terminui-inspired).
 *
 * @example
 * ```typescript
 * import * as shell from "@eserstack/shell";
 *
 * const ctx = shell.tui.createTuiContext();
 * const s = shell.tui.createSpinner(ctx, "Installing...");
 * s.start();
 * // await doWork();
 * s.succeed("Installed!");
 * ```
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as symbols from "./symbols.ts";
import type { TuiContext } from "./types.ts";

/** How a spinner animates. */
export type SpinnerOptions = {
  /** The frames shown in turn; a braille dot cycle when unset. */
  readonly frames?: readonly string[];
  /** Milliseconds between frames; 80 when unset. */
  readonly interval?: number;
};

/**
 * Controls for a spinner from {@link createSpinner}. Each method that ends the
 * spinner stops its timer and, except `stop`, writes a final line with an
 * icon; a `message` given there replaces the current one.
 */
export type SpinnerHandle = {
  /** Start animating, optionally with a new message. */
  readonly start: (message?: string) => void;
  /** Stop and clear the line without a final line. */
  readonly stop: (message?: string) => void;
  /** Change the message shown next to the animation. */
  readonly update: (message: string) => void;
  /** Stop with a success line. */
  readonly succeed: (message?: string) => void;
  /** Stop with a failure line. */
  readonly fail: (message?: string) => void;
  /** Stop with a warning line. */
  readonly warn: (message?: string) => void;
  /** Stop with an information line. */
  readonly info: (message?: string) => void;
};

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL = 80;

/**
 * Create a spinner that writes to `ctx.output`. It does not start until
 * `start()` is called.
 */
export const createSpinner = (
  ctx: TuiContext,
  initialMessage: string,
  options?: SpinnerOptions,
): SpinnerHandle => {
  const frames = options?.frames ?? DEFAULT_FRAMES;
  const interval = options?.interval ?? DEFAULT_INTERVAL;

  let message = initialMessage;
  let currentFrame = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const clearLine = (): void => {
    ctx.output.write(
      span.text(`\r${" ".repeat(message.length + 4)}\r`),
    );
  };

  const stopTimer = (): void => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
      clearLine();
    }
  };

  return {
    start: (msg?: string) => {
      if (msg !== undefined) message = msg;
      intervalId = setInterval(() => {
        const frame = frames[currentFrame % frames.length];
        ctx.output.write(
          span.text("\r"),
          span.cyan(frame ?? ""),
          span.text(` ${message}`),
        );
        currentFrame++;
      }, interval);
    },

    stop: (msg?: string) => {
      stopTimer();
      if (msg !== undefined) message = msg;
    },

    update: (msg: string) => {
      message = msg;
    },

    succeed: (msg?: string) => {
      stopTimer();
      ctx.output.writeln(
        span.green(symbols.PROMPT_DONE),
        span.text(`  ${msg ?? message}`),
      );
    },

    fail: (msg?: string) => {
      stopTimer();
      ctx.output.writeln(
        span.red(symbols.PROMPT_CANCEL),
        span.text(`  ${msg ?? message}`),
      );
    },

    warn: (msg?: string) => {
      stopTimer();
      ctx.output.writeln(
        span.yellow(symbols.S_WARN),
        span.text(`  ${msg ?? message}`),
      );
    },

    info: (msg?: string) => {
      stopTimer();
      ctx.output.writeln(
        span.blue(symbols.S_INFO),
        span.text(`  ${msg ?? message}`),
      );
    },
  };
};
