// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ScreenBuffer — 2D grid of styled characters for virtual terminal emulation.
 * @module
 */

import type { RGB, TextStyle } from "./sgr.ts";

export type Cell = {
  char: string;
  fg: number;
  bg: number;
  fgRGB: RGB | null;
  bgRGB: RGB | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
};

const defaultCell = (): Cell => ({
  char: " ",
  fg: -1,
  bg: -1,
  fgRGB: null,
  bgRGB: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
});

const createGrid = (rows: number, cols: number): Cell[][] => {
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(defaultCell());
    }
    grid.push(row);
  }
  return grid;
};

const makeRow = (cols: number): Cell[] => {
  const row: Cell[] = [];
  for (let c = 0; c < cols; c++) {
    row.push(defaultCell());
  }
  return row;
};

export class ScreenBuffer {
  #rows: number;
  #cols: number;
  #grid: Cell[][];
  #altGrid: Cell[][] | null = null;
  #scrollTop = 0;
  #scrollBottom: number;
  #dirty: Set<number> = new Set();

  constructor(rows: number, cols: number) {
    this.#rows = rows;
    this.#cols = cols;
    this.#grid = createGrid(rows, cols);
    this.#scrollBottom = rows - 1;
  }

  get rows(): number {
    return this.#rows;
  }

  get cols(): number {
    return this.#cols;
  }

  getCell(row: number, col: number): Cell {
    if (row < 0 || row >= this.#rows || col < 0 || col >= this.#cols) {
      return defaultCell();
    }
    return this.#grid[row]![col]!;
  }

  setCell(row: number, col: number, style: TextStyle, char: string): void {
    if (row < 0 || row >= this.#rows || col < 0 || col >= this.#cols) return;
    this.#grid[row]![col] = {
      char,
      fg: style.fg,
      bg: style.bg,
      fgRGB: style.fgRGB,
      bgRGB: style.bgRGB,
      bold: style.bold,
      dim: style.dim,
      italic: style.italic,
      underline: style.underline,
      inverse: style.inverse,
    };
    this.#dirty.add(row);
  }

  scrollUp(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.#grid.splice(this.#scrollTop, 1);
      this.#grid.splice(this.#scrollBottom, 0, makeRow(this.#cols));
    }
    // All lines dirty after scroll
    for (let r = this.#scrollTop; r <= this.#scrollBottom; r++) {
      this.#dirty.add(r);
    }
  }

  scrollDown(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.#grid.splice(this.#scrollBottom, 1);
      this.#grid.splice(this.#scrollTop, 0, makeRow(this.#cols));
    }
    for (let r = this.#scrollTop; r <= this.#scrollBottom; r++) {
      this.#dirty.add(r);
    }
  }

  setScrollRegion(top: number, bottom: number): void {
    this.#scrollTop = Math.max(0, top);
    this.#scrollBottom = Math.min(this.#rows - 1, bottom);
  }

  insertLines(n: number, atRow: number): void {
    for (let i = 0; i < n; i++) {
      this.#grid.splice(this.#scrollBottom, 1);
      this.#grid.splice(atRow, 0, makeRow(this.#cols));
    }
    for (let r = atRow; r <= this.#scrollBottom; r++) {
      this.#dirty.add(r);
    }
  }

  deleteLines(n: number, atRow: number): void {
    for (let i = 0; i < n; i++) {
      this.#grid.splice(atRow, 1);
      this.#grid.splice(this.#scrollBottom, 0, makeRow(this.#cols));
    }
    for (let r = atRow; r <= this.#scrollBottom; r++) {
      this.#dirty.add(r);
    }
  }

  clearLine(row: number, mode: number): void {
    if (row < 0 || row >= this.#rows) return;
    // mode: 0=cursor->end (handled by caller with col), 1=start->cursor, 2=whole
    const line = this.#grid[row]!;
    if (mode === 2) {
      for (let c = 0; c < this.#cols; c++) {
        line[c] = defaultCell();
      }
    }
    this.#dirty.add(row);
  }

  clearLineRange(row: number, startCol: number, endCol: number): void {
    if (row < 0 || row >= this.#rows) return;
    const line = this.#grid[row]!;
    for (let c = startCol; c <= Math.min(endCol, this.#cols - 1); c++) {
      line[c] = defaultCell();
    }
    this.#dirty.add(row);
  }

  clearDisplay(mode: number, cursorRow: number, cursorCol: number): void {
    if (mode === 0) {
      // Cursor to end
      this.clearLineRange(cursorRow, cursorCol, this.#cols - 1);
      for (let r = cursorRow + 1; r < this.#rows; r++) {
        this.clearLine(r, 2);
      }
    } else if (mode === 1) {
      // Start to cursor
      for (let r = 0; r < cursorRow; r++) {
        this.clearLine(r, 2);
      }
      this.clearLineRange(cursorRow, 0, cursorCol);
    } else {
      // Whole screen
      this.#grid = createGrid(this.#rows, this.#cols);
      for (let r = 0; r < this.#rows; r++) {
        this.#dirty.add(r);
      }
    }
  }

  enterAlternateScreen(): void {
    this.#altGrid = this.#grid;
    this.#grid = createGrid(this.#rows, this.#cols);
    for (let r = 0; r < this.#rows; r++) {
      this.#dirty.add(r);
    }
  }

  exitAlternateScreen(): void {
    if (this.#altGrid !== null) {
      this.#grid = this.#altGrid;
      this.#altGrid = null;
      for (let r = 0; r < this.#rows; r++) {
        this.#dirty.add(r);
      }
    }
  }

  resize(rows: number, cols: number): void {
    const newGrid = createGrid(rows, cols);
    const copyRows = Math.min(rows, this.#rows);
    const copyCols = Math.min(cols, this.#cols);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        newGrid[r]![c] = this.#grid[r]![c]!;
      }
    }
    this.#rows = rows;
    this.#cols = cols;
    this.#grid = newGrid;
    this.#scrollBottom = rows - 1;
    for (let r = 0; r < rows; r++) {
      this.#dirty.add(r);
    }
  }

  getLine(row: number): Cell[] {
    if (row < 0 || row >= this.#rows) return makeRow(this.#cols);
    return this.#grid[row]!;
  }

  getGrid(): Cell[][] {
    return this.#grid;
  }

  getDirtyLines(): ReadonlySet<number> {
    return this.#dirty;
  }

  clearDirty(): void {
    this.#dirty.clear();
  }

  markAllDirty(): void {
    for (let r = 0; r < this.#rows; r++) {
      this.#dirty.add(r);
    }
  }

  markLineDirty(row: number): void {
    if (row >= 0 && row < this.#rows) {
      this.#dirty.add(row);
    }
  }
}
