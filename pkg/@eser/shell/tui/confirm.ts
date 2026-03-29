// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Confirm prompt — yes/no boolean choice.
 *
 * ```
 * ◆  Deploy to production?
 * │  ● Yes / ○ No
 * └
 * ```
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as symbols from "./symbols.ts";
import * as types from "./types.ts";
import * as keypress from "./keypress.ts";

const renderFrame = (
  ctx: types.TuiContext,
  message: string,
  value: boolean,
  state: "active" | "done" | "cancel",
): number => {
  if (state === "done") {
    const answer = value ? "Yes" : "No";
    ctx.output.writeln(
      span.green(symbols.PROMPT_DONE),
      span.text(`  ${message}`),
      span.dim(` · ${answer}`),
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
  const yes = value
    ? span.group(span.green(symbols.RADIO_ACTIVE), span.text(" Yes"))
    : span.group(span.dim(symbols.RADIO_INACTIVE), span.dim(" Yes"));
  const no = !value
    ? span.group(span.green(symbols.RADIO_ACTIVE), span.text(" No"))
    : span.group(span.dim(symbols.RADIO_INACTIVE), span.dim(" No"));

  ctx.output.writeln(
    span.cyan(symbols.PROMPT_ACTIVE),
    span.text(`  ${message}`),
  );
  ctx.output.writeln(
    span.dim(symbols.BAR),
    span.text("  "),
    yes,
    span.dim(" / "),
    no,
  );
  ctx.output.writeln(span.dim(symbols.BAR_END));

  return 3;
};

export const confirm = async (
  ctx: types.TuiContext,
  options: types.ConfirmOptions,
): Promise<boolean | types.Cancel> => {
  let value = options.initialValue ?? true;
  let lines = 0;

  keypress.hideCursor(ctx.output);

  try {
    return await keypress.withRawMode(async () => {
      lines = renderFrame(ctx, options.message, value, "active");
      await ctx.output.flush();

      const cancelPrompt = (): void => {
        keypress.clearLines(ctx.output, lines);
        renderFrame(ctx, options.message, value, "cancel");
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
          keypress.clearLines(ctx.output, lines);
          renderFrame(ctx, options.message, value, "done");
          await ctx.output.flush();
          return value;
        }

        let changed = false;

        if (key.name === "left" || key.name === "right") {
          value = !value;
          changed = true;
        }

        if (key.name === "y" || key.name === "Y") {
          value = true;
          changed = true;
        }

        if (key.name === "n" || key.name === "N") {
          value = false;
          changed = true;
        }

        if (changed) {
          keypress.clearLines(ctx.output, lines);
          lines = renderFrame(ctx, options.message, value, "active");
          await ctx.output.flush();
        }
      }

      return types.CANCEL;
    });
  } finally {
    keypress.showCursor(ctx.output);
    await ctx.output.flush();
  }
};
