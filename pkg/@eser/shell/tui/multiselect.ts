// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Multi-choice select prompt with toggle.
 *
 * ```
 * ◆  Select features
 * │  ◼ TypeScript
 * │  ◻ ESLint
 * │  ◼ Prettier
 * └
 * ```
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as symbols from "./symbols.ts";
import * as types from "./types.ts";
import * as keypress from "./keypress.ts";

const renderFrame = <T>(
  ctx: types.TuiContext,
  message: string,
  options: types.MultiselectOptions<T>["options"],
  cursor: number,
  selected: ReadonlySet<number>,
  error: string | undefined,
  state: "active" | "done" | "cancel",
): number => {
  if (state === "done") {
    const labels = [...selected]
      .sort((a, b) => a - b)
      .map((i) => options[i]?.label ?? "")
      .join(", ");
    ctx.output.writeln(
      span.green(symbols.PROMPT_DONE),
      span.text(`  ${message}`),
      span.dim(` · ${labels}`),
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
  const headerSymbol = error !== undefined
    ? span.yellow(symbols.S_WARN)
    : span.cyan(symbols.PROMPT_ACTIVE);

  ctx.output.writeln(headerSymbol, span.text(`  ${message}`));

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const isCursor = i === cursor;
    const isChecked = selected.has(i);
    const isDisabled = opt.disabled === true;

    const checkbox = isChecked
      ? span.green(symbols.CHECKBOX_ACTIVE)
      : span.dim(symbols.CHECKBOX_INACTIVE);

    const label = isDisabled
      ? span.dim(` ${opt.label}`)
      : isCursor
      ? span.text(` ${opt.label}`)
      : span.dim(` ${opt.label}`);

    const hint = opt.hint !== undefined
      ? span.dim(`  (${opt.hint})`)
      : span.text("");

    ctx.output.writeln(
      span.dim(symbols.BAR),
      span.text("  "),
      checkbox,
      label,
      hint,
    );
  }

  const lineCount = options.length + 2;

  if (error !== undefined) {
    ctx.output.writeln(
      span.dim(symbols.BAR_END),
      span.text("  "),
      span.yellow(error),
    );
  } else {
    ctx.output.writeln(span.dim(symbols.BAR_END));
  }

  return lineCount;
};

/** Find next non-disabled index in given direction. */
const findNext = <T>(
  options: types.MultiselectOptions<T>["options"],
  current: number,
  direction: 1 | -1,
): number => {
  const len = options.length;
  let next = current;

  for (let i = 0; i < len; i++) {
    next = (next + direction + len) % len;
    if (options[next]?.disabled !== true) return next;
  }

  return current;
};

export const multiselect = async <T>(
  ctx: types.TuiContext,
  options: types.MultiselectOptions<T>,
): Promise<T[] | types.Cancel> => {
  let cursor = 0;

  // Initialize selected set from initialValues
  const selected = new Set<number>();
  if (options.initialValues !== undefined) {
    for (const val of options.initialValues) {
      const idx = options.options.findIndex((o) => o.value === val);
      if (idx >= 0) selected.add(idx);
    }
  }

  // Ensure cursor is on a non-disabled option
  if (options.options[cursor]?.disabled === true) {
    cursor = findNext(options.options, cursor, 1);
  }

  let lines = 0;
  let error: string | undefined;

  keypress.hideCursor(ctx.output);

  try {
    return await keypress.withRawMode(async () => {
      lines = renderFrame(
        ctx,
        options.message,
        options.options,
        cursor,
        selected,
        error,
        "active",
      );
      await ctx.output.flush();

      for await (const key of keypress.readKeypress(ctx.input)) {
        if (key.name === "c" && key.ctrl) {
          keypress.clearLines(ctx.output, lines);
          renderFrame(
            ctx,
            options.message,
            options.options,
            cursor,
            selected,
            undefined,
            "cancel",
          );
          await ctx.output.flush();
          return types.CANCEL;
        }

        if (key.name === "escape") {
          keypress.clearLines(ctx.output, lines);
          renderFrame(
            ctx,
            options.message,
            options.options,
            cursor,
            selected,
            undefined,
            "cancel",
          );
          await ctx.output.flush();
          return types.CANCEL;
        }

        if (key.name === "return") {
          if (options.required !== false && selected.size === 0) {
            error = "Please select at least one option.";
            keypress.clearLines(ctx.output, lines);
            lines = renderFrame(
              ctx,
              options.message,
              options.options,
              cursor,
              selected,
              error,
              "active",
            );
            await ctx.output.flush();
            continue;
          }

          keypress.clearLines(ctx.output, lines);
          renderFrame(
            ctx,
            options.message,
            options.options,
            cursor,
            selected,
            undefined,
            "done",
          );
          await ctx.output.flush();

          return [...selected]
            .sort((a, b) => a - b)
            .map((i) => options.options[i]!.value);
        }

        error = undefined;
        let changed = false;

        if (key.name === "up" || key.name === "k") {
          cursor = findNext(options.options, cursor, -1);
          changed = true;
        }

        if (key.name === "down" || key.name === "j") {
          cursor = findNext(options.options, cursor, 1);
          changed = true;
        }

        if (key.name === "space") {
          if (options.options[cursor]?.disabled !== true) {
            if (selected.has(cursor)) {
              selected.delete(cursor);
            } else {
              selected.add(cursor);
            }
            changed = true;
          }
        }

        if (key.name === "a") {
          // Toggle all non-disabled
          const allSelected = options.options.every(
            (opt, i) => opt.disabled === true || selected.has(i),
          );
          for (let i = 0; i < options.options.length; i++) {
            if (options.options[i]?.disabled !== true) {
              if (allSelected) {
                selected.delete(i);
              } else {
                selected.add(i);
              }
            }
          }
          changed = true;
        }

        if (changed) {
          keypress.clearLines(ctx.output, lines);
          lines = renderFrame(
            ctx,
            options.message,
            options.options,
            cursor,
            selected,
            error,
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
