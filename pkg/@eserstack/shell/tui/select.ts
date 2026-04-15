// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Single-choice select prompt.
 *
 * ```
 * ◆  Pick a framework
 * │  ● Next.js
 * │  ○ SvelteKit
 * │  ○ Astro  (recommended)
 * └
 * ```
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as symbols from "./symbols.ts";
import * as types from "./types.ts";
import * as keypress from "./keypress.ts";

const renderFrame = <T>(
  ctx: types.TuiContext,
  message: string,
  options: types.SelectOptions<T>["options"],
  cursor: number,
  state: "active" | "done" | "cancel",
): number => {
  if (state === "done") {
    const selected = options[cursor];
    ctx.output.writeln(
      span.green(symbols.PROMPT_DONE),
      span.text(`  ${message}`),
      span.dim(` · ${selected?.label ?? ""}`),
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
  ctx.output.writeln(
    span.cyan(symbols.PROMPT_ACTIVE),
    span.text(`  ${message}`),
  );

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const isSelected = i === cursor;
    const isDisabled = opt.disabled === true;

    const radio = isSelected
      ? span.green(symbols.RADIO_ACTIVE)
      : span.dim(symbols.RADIO_INACTIVE);

    const label = isDisabled
      ? span.dim(` ${opt.label}`)
      : isSelected
      ? span.text(` ${opt.label}`)
      : span.dim(` ${opt.label}`);

    const hint = opt.hint !== undefined
      ? span.dim(`  (${opt.hint})`)
      : span.text("");

    ctx.output.writeln(
      span.dim(symbols.BAR),
      span.text("  "),
      radio,
      label,
      hint,
    );
  }

  ctx.output.writeln(span.dim(symbols.BAR_END));

  return options.length + 2; // header + options + footer
};

/** Find next non-disabled index in given direction. */
const findNext = <T>(
  options: types.SelectOptions<T>["options"],
  current: number,
  direction: 1 | -1,
): number => {
  const len = options.length;
  let next = current;

  for (let i = 0; i < len; i++) {
    next = (next + direction + len) % len;
    if (options[next]?.disabled !== true) return next;
  }

  return current; // all disabled, stay put
};

export const select = async <T>(
  ctx: types.TuiContext,
  options: types.SelectOptions<T>,
): Promise<T | types.Cancel> => {
  // Start cursor at initialValue or first non-disabled option
  let cursor = 0;

  if (options.initialValue !== undefined) {
    const idx = options.options.findIndex((o) =>
      o.value === options.initialValue
    );
    if (idx >= 0) cursor = idx;
  }

  // Ensure cursor is on a non-disabled option
  if (options.options[cursor]?.disabled === true) {
    cursor = findNext(options.options, cursor, 1);
  }

  let lines = 0;

  keypress.hideCursor(ctx.output);

  try {
    return await keypress.withRawMode(async () => {
      lines = renderFrame(
        ctx,
        options.message,
        options.options,
        cursor,
        "active",
      );
      await ctx.output.flush();

      const cancelPrompt = (): void => {
        keypress.clearLines(ctx.output, lines);
        renderFrame(ctx, options.message, options.options, cursor, "cancel");
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
          renderFrame(ctx, options.message, options.options, cursor, "done");
          await ctx.output.flush();
          return options.options[cursor]!.value;
        }

        let changed = false;

        if (key.name === "up" || key.name === "k") {
          cursor = findNext(options.options, cursor, -1);
          changed = true;
        }

        if (key.name === "down" || key.name === "j") {
          cursor = findNext(options.options, cursor, 1);
          changed = true;
        }

        if (changed) {
          keypress.clearLines(ctx.output, lines);
          lines = renderFrame(
            ctx,
            options.message,
            options.options,
            cursor,
            "active",
          );
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
