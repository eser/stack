// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * List widget with badges, selection highlighting, and active/dimmed states.
 *
 * `renderList` produces an ANSI string that draws a scrollable list
 * inside a given panel. The caller is responsible for writing the result
 * to the terminal.
 *
 * @module
 */

import * as ansi from "./ansi.ts";
import type { Panel } from "./layout.ts";

/** One row of a list drawn by {@link renderList}. */
export type ListItem = {
  /** The row's text. */
  readonly label: string;
  /** Short text shown in brackets after the label. */
  readonly badge?: string;
  /** Color of the badge; "dim" when unset. */
  readonly badgeColor?: "green" | "yellow" | "red" | "cyan" | "dim";
  /** Shows a green bullet, for the item currently in use. */
  readonly active?: boolean;
  /** Draws the label dimmed. */
  readonly dimmed?: boolean;
  /** False for a row the selection skips, such as a heading; true when unset. */
  readonly selectable?: boolean;
};

const colorize = (text: string, color: string): string => {
  switch (color) {
    case "green":
      return ansi.green(text);
    case "yellow":
      return ansi.yellow(text);
    case "red":
      return ansi.red(text);
    case "cyan":
      return ansi.cyan(text);
    case "dim":
      return ansi.dim(text);
    default:
      return text;
  }
};

/**
 * Find the next selectable index in the given direction.
 * Skips items with `selectable: false`. Returns current if no selectable found.
 */
export const nextSelectableIndex = (
  items: readonly ListItem[],
  current: number,
  direction: "up" | "down",
): number => {
  const step = direction === "up" ? -1 : 1;
  let next = current + step;

  while (next >= 0 && next < items.length) {
    if (items[next]!.selectable !== false) return next;
    next += step;
  }

  // No selectable found in direction — stay put
  return current;
};

/** Render a scrollable list inside the given panel area. */
export const renderList = (
  items: readonly ListItem[],
  selectedIndex: number,
  panel: Panel,
): string => {
  const lines: string[] = [];
  const innerWidth = panel.width - 2;
  const maxVisible = panel.height - 2;

  // Scrolling: keep selected item visible
  let startIdx = 0;
  if (selectedIndex >= maxVisible) {
    startIdx = selectedIndex - maxVisible + 1;
  }

  for (let i = 0; i < maxVisible; i++) {
    const idx = startIdx + i;
    const row = panel.y + 1 + i;

    if (idx >= items.length) {
      lines.push(ansi.moveTo(row, panel.x + 1) + " ".repeat(innerWidth));
      continue;
    }

    const item = items[idx]!;
    const isSelectable = item.selectable !== false; // default true
    const selected = idx === selectedIndex && isSelectable;
    const bullet = item.active
      ? ansi.green("\u25CF")
      : selected
        ? "\u25B8"
        : " ";
    const badge =
      item.badge !== undefined
        ? " " + colorize(`[${item.badge}]`, item.badgeColor ?? "dim")
        : "";
    const label = item.dimmed ? ansi.dim(item.label) : item.label;
    const line = ` ${bullet} ${label}${badge}`;
    const truncated = ansi.truncate(line, innerWidth);
    const pad = Math.max(0, innerWidth - ansi.visibleLength(truncated));

    if (selected) {
      lines.push(
        ansi.moveTo(row, panel.x + 1) +
          ansi.inverse(truncated + " ".repeat(pad)),
      );
    } else {
      lines.push(ansi.moveTo(row, panel.x + 1) + truncated + " ".repeat(pad));
    }
  }

  return lines.join("");
};
