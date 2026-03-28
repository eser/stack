// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Progress bar — uses the `gauge` span for multi-target rendering.
 *
 * ```
 * ◇  Downloading
 * │  ████████████░░░░░░░░  60%  Fetching data...
 * ```
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as symbols from "./symbols.ts";
import * as keypress from "./keypress.ts";
import * as types from "./types.ts";

export type ProgressOptions = {
  readonly total: number;
  readonly width?: number;
  readonly label?: string;
};

export type ProgressHandle = {
  readonly start: (label?: string) => void;
  readonly advance: (amount: number, label?: string) => void;
  readonly stop: (label?: string) => void;
};

export const createProgress = (
  ctx: types.TuiContext,
  options: ProgressOptions,
): ProgressHandle => {
  let current = 0;
  let label = options.label ?? "";
  let started = false;

  const render = (): void => {
    const percent = options.total > 0
      ? Math.round((current / options.total) * 100)
      : 0;

    keypress.eraseLine(ctx.output);
    ctx.output.write(
      span.dim(symbols.BAR),
      span.text("  "),
      span.gauge(percent, { width: options.width ?? 20, label }),
    );
  };

  return {
    start: (startLabel?: string) => {
      if (startLabel !== undefined) label = startLabel;
      started = true;
      ctx.output.writeln(
        span.dim(symbols.PROMPT_DONE),
        span.text(`  ${label}`),
      );
      render();
    },

    advance: (amount: number, newLabel?: string) => {
      if (!started) return;
      current = Math.min(current + amount, options.total);
      if (newLabel !== undefined) label = newLabel;
      render();
    },

    stop: (stopLabel?: string) => {
      if (!started) return;
      started = false;
      current = options.total;
      if (stopLabel !== undefined) label = stopLabel;
      keypress.eraseLine(ctx.output);
      ctx.output.writeln(
        span.dim(symbols.BAR),
        span.text("  "),
        span.gauge(100, { width: options.width ?? 20, label }),
      );
    },
  };
};
