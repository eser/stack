// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Text input prompt with validation.
 *
 * ```
 * ◆  What is your project name?
 * │  my-project▌
 * └
 * ```
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as symbols from "./symbols.ts";
import * as types from "./types.ts";
import * as keypress from "./keypress.ts";

const renderFrame = (
  ctx: types.TuiContext,
  message: string,
  value: string,
  placeholder: string | undefined,
  error: string | undefined,
  state: "active" | "done" | "cancel",
): number => {
  if (state === "done") {
    ctx.output.writeln(
      span.green(symbols.PROMPT_DONE),
      span.text(`  ${message}`),
      span.dim(` · ${value}`),
    );
    return 1;
  }

  if (state === "cancel") {
    ctx.output.writeln(
      span.red(symbols.PROMPT_CANCEL),
      span.text(`  ${message}`),
    );
    return 1;
  }

  // Active state
  const displayValue = value.length > 0
    ? span.text(value)
    : placeholder !== undefined
    ? span.dim(placeholder)
    : span.text("");

  const headerSymbol = error !== undefined
    ? span.yellow(symbols.S_WARN)
    : span.cyan(symbols.PROMPT_ACTIVE);

  ctx.output.writeln(headerSymbol, span.text(`  ${message}`));
  ctx.output.writeln(
    span.dim(symbols.BAR),
    span.text("  "),
    displayValue,
  );

  let lineCount = 2;

  if (error !== undefined) {
    ctx.output.writeln(
      span.dim(symbols.BAR_END),
      span.text("  "),
      span.yellow(error),
    );
    lineCount = 3;
  } else {
    ctx.output.writeln(span.dim(symbols.BAR_END));
    lineCount = 3;
  }

  return lineCount;
};

export const text = async (
  ctx: types.TuiContext,
  options: types.TextOptions,
): Promise<string | types.Cancel> => {
  let value = options.initialValue ?? "";
  let cursor = value.length;
  let error: string | undefined;
  let lines = 0;

  keypress.hideCursor(ctx.output);

  try {
    return await keypress.withRawMode(async () => {
      lines = renderFrame(
        ctx,
        options.message,
        value,
        options.placeholder,
        error,
        "active",
      );
      await ctx.output.flush();

      const cancelPrompt = (): void => {
        keypress.clearLines(ctx.output, lines);
        renderFrame(
          ctx,
          options.message,
          value,
          options.placeholder,
          undefined,
          "cancel",
        );
      };

      for await (const key of keypress.readKeypress(ctx.input)) {
        if (key.name === "c" && key.ctrl) {
          const action = keypress.handleSignal(ctx.signals.ctrlC, ctx);
          if (action === "cancel") {
            cancelPrompt();
            await ctx.output.flush();
            return types.CANCEL;
          }
          continue;
        }

        if (key.name === "escape") {
          const action = keypress.handleSignal(ctx.signals.escape, ctx);
          if (action === "cancel") {
            cancelPrompt();
            await ctx.output.flush();
            return types.CANCEL;
          }
          continue;
        }

        if (key.name === "return") {
          // Validate
          if (options.validate !== undefined) {
            const validationError = options.validate(value);
            if (validationError !== undefined) {
              error = validationError;
              keypress.clearLines(ctx.output, lines);
              lines = renderFrame(
                ctx,
                options.message,
                value,
                options.placeholder,
                error,
                "active",
              );
              await ctx.output.flush();
              continue;
            }
          }

          keypress.clearLines(ctx.output, lines);
          renderFrame(
            ctx,
            options.message,
            value,
            options.placeholder,
            undefined,
            "done",
          );
          await ctx.output.flush();
          return value;
        }

        // Clear error on any input
        error = undefined;

        if (key.name === "backspace") {
          if (cursor > 0) {
            value = value.slice(0, cursor - 1) + value.slice(cursor);
            cursor--;
          }
        } else if (key.name === "left") {
          if (cursor > 0) cursor--;
        } else if (key.name === "right") {
          if (cursor < value.length) cursor++;
        } else if (key.name === "home") {
          cursor = 0;
        } else if (key.name === "end") {
          cursor = value.length;
        } else if (key.char !== undefined) {
          value = value.slice(0, cursor) + key.char + value.slice(cursor);
          cursor++;
        } else {
          continue;
        }

        keypress.clearLines(ctx.output, lines);
        lines = renderFrame(
          ctx,
          options.message,
          value,
          options.placeholder,
          error,
          "active",
        );
        await ctx.output.flush();
      }

      return types.CANCEL;
    });
  } finally {
    keypress.showCursor(ctx.output);
    await ctx.output.flush();
  }
};
