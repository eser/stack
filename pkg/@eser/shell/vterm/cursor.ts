// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cursor state for virtual terminal — position, visibility, save/restore.
 * @module
 */

export class Cursor {
  row = 0;
  col = 0;
  visible = true;
  #savedRow = 0;
  #savedCol = 0;

  moveTo(row: number, col: number): void {
    this.row = row;
    this.col = col;
  }

  moveUp(n = 1): void {
    this.row = Math.max(0, this.row - n);
  }

  moveDown(n = 1): void {
    this.row += n;
  }

  moveForward(n = 1): void {
    this.col += n;
  }

  moveBack(n = 1): void {
    this.col = Math.max(0, this.col - n);
  }

  moveToColumn(col: number): void {
    this.col = col;
  }

  save(): void {
    this.#savedRow = this.row;
    this.#savedCol = this.col;
  }

  restore(): void {
    this.row = this.#savedRow;
    this.col = this.#savedCol;
  }

  clamp(maxRow: number, maxCol: number): void {
    this.row = Math.max(0, Math.min(this.row, maxRow - 1));
    this.col = Math.max(0, Math.min(this.col, maxCol - 1));
  }
}
