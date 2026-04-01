// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Renderer — converts ScreenBuffer to ANSI escape sequences for display.
 * Supports offset rendering (for embedding in a panel) and dirty-line tracking.
 *
 * Only emits SGR codes when style differs from the terminal default.
 * Cells with default fg/bg (-1, no RGB) get no color codes — the terminal's
 * native background shows through.
 *
 * @module
 */

import type * as screen from "./screen.ts";
import type * as cursor from "./cursor.ts";

export type RenderOptions = {
  readonly offsetRow: number;
  readonly offsetCol: number;
  readonly width: number;
  readonly height: number;
  readonly fullRedraw?: boolean;
};

/**
 * Build SGR for a cell — foreground + attributes only.
 * Background is intentionally omitted: the terminal's native background
 * always shows through. This prevents dark block artifacts when the child
 * app (e.g., Claude Code) relies on default background transparency.
 */
const cellToSGR = (cell: screen.Cell): string => {
  const codes: number[] = [];

  if (cell.bold) codes.push(1);
  if (cell.dim) codes.push(2);
  if (cell.italic) codes.push(3);
  if (cell.underline) codes.push(4);

  if (cell.fgRGB !== null) {
    codes.push(38, 2, cell.fgRGB.r, cell.fgRGB.g, cell.fgRGB.b);
  } else if (cell.fg >= 0 && cell.fg < 8) {
    codes.push(30 + cell.fg);
  } else if (cell.fg >= 8 && cell.fg < 16) {
    codes.push(90 + (cell.fg - 8));
  } else if (cell.fg >= 16) {
    codes.push(38, 5, cell.fg);
  }

  if (codes.length === 0) return "";
  return `\x1b[${codes.join(";")}m`;
};

/** A cell needs no SGR if it has default fg and no rendered attributes. */
const isDefaultCell = (cell: screen.Cell): boolean =>
  cell.fg === -1 && cell.fgRGB === null &&
  !cell.bold && !cell.dim && !cell.italic && !cell.underline;

export const renderScreen = (
  screenBuf: screen.ScreenBuffer,
  _cursor: cursor.Cursor,
  opts: RenderOptions,
): string => {
  const out: string[] = [];
  const dirty = screenBuf.getDirtyLines();

  // If fullRedraw requested, or if most lines are dirty, render all
  const renderAll = opts.fullRedraw === true || dirty.size >= opts.height;
  const renderRows = Math.min(opts.height, screenBuf.rows);
  const renderCols = Math.min(opts.width, screenBuf.cols);

  for (let r = 0; r < renderRows; r++) {
    if (!renderAll && !dirty.has(r)) continue;

    // Position cursor at start of this line in the panel
    out.push(`\x1b[${opts.offsetRow + r};${opts.offsetCol}H`);

    const line = screenBuf.getLine(r);
    let inStyleRun = false;
    let col = 0;

    // Render cells up to panel width, clamped to line length
    for (; col < renderCols; col++) {
      const cell = col < line.length ? line[col]! : undefined;

      if (cell === undefined || isDefaultCell(cell)) {
        if (inStyleRun) {
          out.push("\x1b[0m");
          inStyleRun = false;
        }
        out.push(cell?.char ?? " ");
      } else {
        const sgr = cellToSGR(cell);
        out.push(sgr);
        inStyleRun = true;
        out.push(cell.char);
      }
    }

    // Reset at end of each line to prevent color bleeding
    if (inStyleRun) {
      out.push("\x1b[0m");
    }
  }

  screenBuf.clearDirty();
  return out.join("");
};
