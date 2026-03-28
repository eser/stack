// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal spinner — pure functional API (terminui-inspired).
 *
 * @example
 * ```typescript
 * import * as tui from "@eser/shell/tui";
 *
 * const ctx = tui.createTuiContext();
 * const s = tui.createSpinner(ctx, "Installing...");
 * s.start();
 * // await doWork();
 * s.succeed("Installed!");
 * ```
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as symbols from "./symbols.ts";
import type { TuiContext } from "./types.ts";

export type SpinnerOptions = {
  readonly frames?: readonly string[];
  readonly interval?: number;
};

export type SpinnerHandle = {
  readonly start: (message?: string) => void;
  readonly stop: (message?: string) => void;
  readonly update: (message: string) => void;
  readonly succeed: (message?: string) => void;
  readonly fail: (message?: string) => void;
  readonly warn: (message?: string) => void;
  readonly info: (message?: string) => void;
};

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_INTERVAL = 80;

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
