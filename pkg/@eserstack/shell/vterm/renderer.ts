// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Renderer — converts xterm-headless buffer to ANSI escape sequences for TUI panels.
 *
 * Reads cell data from xterm's IBufferCell API. Only emits foreground SGR codes;
 * background is intentionally omitted so the terminal's native background shows through.
 *
 * @module
 */

import type * as xtermHeadless from "@xterm/headless";
import * as terminal from "./terminal.ts";

/** Where on the screen to draw the terminal, and how much of it. */
export type RenderOptions = {
  readonly offsetRow: number;
  readonly offsetCol: number;
  readonly width: number;
  readonly height: number;
  readonly fullRedraw?: boolean;
};

/** Cursor position from the previous frame, used to erase its trail. */
export type RenderState = {
  prevCursorRow: number;
  prevCursorCol: number;
};

/**
 * Build SGR codes for an xterm IBufferCell — foreground + attributes only.
 * Background is intentionally omitted for terminal transparency.
 */
const cellToSGR = (cell: xtermHeadless.IBufferCell): string => {
  const codes: number[] = [];

  if (cell.isBold() !== 0) codes.push(1);
  if (cell.isDim() !== 0) codes.push(2);
  if (cell.isItalic() !== 0) codes.push(3);
  if (cell.isUnderline() !== 0) codes.push(4);

  const fgMode = cell.getFgColorMode();
  const fgColor = cell.getFgColor();

  if (fgMode === terminal.COLOR_MODE_16) {
    if (fgColor >= 0 && fgColor < 8) {
      codes.push(30 + fgColor);
    } else if (fgColor >= 8 && fgColor < 16) {
      codes.push(90 + (fgColor - 8));
    }
  } else if (fgMode === terminal.COLOR_MODE_256) {
    codes.push(38, 5, fgColor);
  } else if (fgMode === terminal.COLOR_MODE_RGB) {
    const r = (fgColor >> 16) & 0xff;
    const g = (fgColor >> 8) & 0xff;
    const b = fgColor & 0xff;
    codes.push(38, 2, r, g, b);
  }

  if (codes.length === 0) return "";
  return `\x1b[${codes.join(";")}m`;
};

/** Check if a cell has default styling (no SGR needed). */
const isDefaultCell = (cell: xtermHeadless.IBufferCell): boolean =>
  cell.getFgColorMode() === terminal.COLOR_MODE_DEFAULT &&
  cell.isBold() === 0 &&
  cell.isDim() === 0 &&
  cell.isItalic() === 0 &&
  cell.isUnderline() === 0;

/**
 * Render the changed lines of a virtual terminal as ANSI escape sequences,
 * positioned at `opts.offsetRow` and `opts.offsetCol`. Passing `state` keeps
 * the cursor from leaving a trail between frames.
 */
export const renderScreen = (
  vterm: terminal.VTerminal,
  opts: RenderOptions,
  state?: RenderState,
): string => {
  const buf = vterm.activeBuffer;
  const curRow = vterm.cursorRow;
  const curCol = vterm.cursorCol;
  const curVisible = vterm.cursorVisible;

  // Mark cursor lines dirty to prevent trails
  if (state !== undefined) {
    if (state.prevCursorRow >= 0 && state.prevCursorRow < vterm.rows) {
      vterm.markLineDirty(state.prevCursorRow);
    }
  }
  if (curVisible && curRow >= 0 && curRow < vterm.rows) {
    vterm.markLineDirty(curRow);
  }

  const dirty = vterm.getDirtyLines();
  const out: string[] = [];

  const renderAll = opts.fullRedraw === true || dirty.size >= opts.height;
  const renderRows = Math.min(opts.height, vterm.rows);
  const renderCols = Math.min(opts.width, vterm.cols);

  for (let r = 0; r < renderRows; r++) {
    if (!renderAll && !dirty.has(r)) continue;

    out.push(`\x1b[${opts.offsetRow + r};${opts.offsetCol}H`);

    const line = buf.getLine(r);
    let inStyleRun = false;

    for (let col = 0; col < renderCols; col++) {
      const cell = line?.getCell(col);
      // An empty cell has no characters; draw it as a space.
      const chars = cell?.getChars() ?? "";
      const ch = chars === "" ? " " : chars;
      const isCursorHere = curVisible && r === curRow && col === curCol;

      if (isCursorHere) {
        if (inStyleRun) {
          out.push("\x1b[0m");
          inStyleRun = false;
        }
        out.push("\x1b[7m");
        out.push(ch);
        out.push("\x1b[27m");
      } else if (cell === null || cell === undefined || isDefaultCell(cell)) {
        if (inStyleRun) {
          out.push("\x1b[0m");
          inStyleRun = false;
        }
        out.push(ch);
      } else {
        const sgr = cellToSGR(cell);
        if (sgr.length > 0) {
          out.push(sgr);
          inStyleRun = true;
        } else if (inStyleRun) {
          out.push("\x1b[0m");
          inStyleRun = false;
        }
        out.push(ch);
      }
    }

    if (inStyleRun) {
      out.push("\x1b[0m");
    }
  }

  if (state !== undefined) {
    state.prevCursorRow = curRow;
    state.prevCursorCol = curCol;
  }

  vterm.clearDirty();
  return out.join("");
};
