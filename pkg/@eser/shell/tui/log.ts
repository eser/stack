// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Non-interactive output: intro, outro, and semantic log messages.
 *
 * Uses `span.alert()` for multi-target semantic rendering.
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as symbols from "./symbols.ts";
import * as types from "./types.ts";

/**
 * Frame the start of a CLI session.
 *
 * ```
 * ┌  create-my-app
 * │
 * ```
 */
export const intro = (ctx: types.TuiContext, title: string): void => {
  ctx.output.writeln(
    span.gray(symbols.BAR_START),
    span.text("  "),
    span.bold(title),
  );
  ctx.output.writeln(span.gray(symbols.BAR));
};

/**
 * Frame the end of a CLI session.
 *
 * ```
 * │
 * └  You're all set!
 * ```
 */
export const outro = (ctx: types.TuiContext, message: string): void => {
  ctx.output.writeln(span.gray(symbols.BAR));
  ctx.output.writeln(
    span.gray(symbols.BAR_END),
    span.text("  "),
    span.text(message),
  );
};

/**
 * Blank line outside the tree — visual breathing room after outro.
 */
export const gapDetached = (ctx: types.TuiContext): void => {
  ctx.output.writeln(span.text(""));
};

/**
 * Detached message after the tree ends — no bar prefix, just indented text.
 *
 * ```
 * └  Done!
 *    Start a spec with: noskills spec new "..."
 * ```
 */
export const messageDetached = (
  ctx: types.TuiContext,
  message: string,
): void => {
  ctx.output.writeln(span.text("   "), span.dim(message));
};

/**
 * Semantic log messages using the alert span system.
 *
 * ```
 * ℹ  Processing...     (info — cyan)
 * ✓  All done!         (success — green)
 * ▲  Disk almost full  (warn — yellow)
 * ✗  Build failed      (error — red)
 * ◇  Step 1 of 3       (step — dim)
 * ```
 */
/**
 * Visual separator between logical groups — a bare connector line.
 *
 * ```
 * │
 * ```
 */
export const gap = (ctx: types.TuiContext): void => {
  ctx.output.writeln(span.gray(symbols.BAR));
};

export const log = {
  info: (ctx: types.TuiContext, message: string): void => {
    ctx.output.writeln(span.alert("info", message));
  },

  success: (ctx: types.TuiContext, message: string): void => {
    ctx.output.writeln(span.alert("success", message));
  },

  warn: (ctx: types.TuiContext, message: string): void => {
    ctx.output.writeln(span.alert("warning", message));
  },

  error: (ctx: types.TuiContext, message: string): void => {
    ctx.output.writeln(span.alert("error", message));
  },

  step: (ctx: types.TuiContext, message: string): void => {
    ctx.output.writeln(
      span.dim(symbols.S_STEP),
      span.text("  "),
      span.dim(message),
    );
  },

  message: (ctx: types.TuiContext, message: string, symbol?: string): void => {
    ctx.output.writeln(
      span.dim(symbol ?? symbols.BAR),
      span.text("  "),
      span.text(message),
    );
  },
};
