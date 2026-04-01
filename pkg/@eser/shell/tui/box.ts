// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Box drawing with single, double, and rounded border styles.
 *
 * `drawBox` renders an empty bordered rectangle; `fillBox` renders the
 * same rectangle and fills it with content lines, truncating and padding
 * as needed.
 *
 * @module
 */

import * as ansi from "./ansi.ts";

export type BorderStyle = "single" | "double" | "rounded";

export type BoxOptions = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly title?: string;
  readonly borderStyle?: BorderStyle;
};

const BORDERS: Record<
  BorderStyle,
  { tl: string; tr: string; bl: string; br: string; h: string; v: string }
> = {
  single: {
    tl: "\u250C",
    tr: "\u2510",
    bl: "\u2514",
    br: "\u2518",
    h: "\u2500",
    v: "\u2502",
  },
  double: {
    tl: "\u2554",
    tr: "\u2557",
    bl: "\u255A",
    br: "\u255D",
    h: "\u2550",
    v: "\u2551",
  },
  rounded: {
    tl: "\u256D",
    tr: "\u256E",
    bl: "\u2570",
    br: "\u256F",
    h: "\u2500",
    v: "\u2502",
  },
};

/**
 * Draw an empty box with the given border style.
 * Set `skipInterior: true` to draw only the border frame (no interior fill).
 * This is used when another renderer (e.g., VTermWidget) paints the interior.
 */
export const drawBox = (
  opts: BoxOptions & { skipInterior?: boolean },
): string => {
  const style = opts.borderStyle ?? "single";
  const b = BORDERS[style];
  const inner = opts.width - 2;
  const lines: string[] = [];

  // Top border with optional title
  let top = b.tl;
  if (opts.title !== undefined) {
    const title = ` ${opts.title} `;
    top += title + b.h.repeat(Math.max(0, inner - title.length));
  } else {
    top += b.h.repeat(inner);
  }
  top += b.tr;
  lines.push(ansi.moveTo(opts.y, opts.x) + top);

  // Middle rows
  if (opts.skipInterior === true) {
    // Border-only: draw left and right edges, skip interior
    for (let r = 1; r < opts.height - 1; r++) {
      lines.push(
        ansi.moveTo(opts.y + r, opts.x) + b.v +
          ansi.moveTo(opts.y + r, opts.x + opts.width - 1) + b.v,
      );
    }
  } else {
    // Full box: reset SGR before interior spaces to prevent color bleeding
    for (let r = 1; r < opts.height - 1; r++) {
      lines.push(
        ansi.moveTo(opts.y + r, opts.x) + b.v + ansi.reset() +
          " ".repeat(inner) + b.v,
      );
    }
  }

  // Bottom border
  lines.push(
    ansi.moveTo(opts.y + opts.height - 1, opts.x) +
      b.bl +
      b.h.repeat(inner) +
      b.br,
  );

  return lines.join("");
};

/** Draw a box and fill it with content lines, truncating to fit. */
export const fillBox = (
  opts: BoxOptions,
  contentLines: readonly string[],
): string => {
  const border = drawBox(opts);
  const inner = opts.width - 2;
  const maxLines = opts.height - 2;
  const content: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const line = i < contentLines.length ? contentLines[i] : "";
    const truncated = ansi.truncate(line ?? "", inner);
    const pad = Math.max(0, inner - ansi.visibleLength(truncated));
    content.push(
      ansi.moveTo(opts.y + 1 + i, opts.x + 1) + truncated + " ".repeat(pad),
    );
  }

  return border + content.join("");
};
