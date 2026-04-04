// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * VTerminal — wraps @xterm/headless for 100% terminal emulation compatibility.
 *
 * Provides the same public API shape as the previous custom implementation.
 * Adds dirty-line tracking via snapshot diff at render time.
 *
 * @module
 */

import xtermHeadless from "@xterm/headless";

// xterm color mode constants (from IBufferCell.getFgColorMode / getBgColorMode)
export const COLOR_MODE_DEFAULT = 0;
export const COLOR_MODE_16 = 0x1000000; // 16777216
export const COLOR_MODE_256 = 0x2000000; // 33554432
export const COLOR_MODE_RGB = 0x3000000; // 50331648

export type XTermBuffer = ReturnType<
  NonNullable<
    InstanceType<typeof xtermHeadless.Terminal>["buffer"]["active"]["getLine"]
  >
>;

export class VTerminal {
  readonly #term: InstanceType<typeof xtermHeadless.Terminal>;
  #rows: number;
  #cols: number;
  #dirty = new Set<number>();
  #prevSnapshot: string[] = [];
  #allDirty = true;

  constructor(rows: number, cols: number) {
    this.#rows = rows;
    this.#cols = cols;
    this.#term = new xtermHeadless.Terminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 0,
    });

    this.#prevSnapshot = Array.from({ length: rows }, () => "");
    this.#allDirty = true;
  }

  /** Feed raw PTY data (async — xterm processes in microtasks). */
  write(data: string): void {
    this.#term.write(data);
  }

  /** Feed raw PTY data and wait for processing to complete. */
  writeAsync(data: string): Promise<void> {
    return new Promise((resolve) => {
      this.#term.write(data, () => resolve());
    });
  }

  /** Resize the terminal. */
  resize(rows: number, cols: number): void {
    this.#rows = rows;
    this.#cols = cols;
    this.#term.resize(cols, rows);
    this.#prevSnapshot = Array.from({ length: rows }, () => "");
    this.#allDirty = true;
  }

  get rows(): number {
    return this.#rows;
  }

  get cols(): number {
    return this.#cols;
  }

  /** Access the xterm active buffer. */
  get activeBuffer(): InstanceType<
    typeof xtermHeadless.Terminal
  >["buffer"]["active"] {
    return this.#term.buffer.active;
  }

  /** Get cursor column. */
  get cursorCol(): number {
    return this.#term.buffer.active.cursorX;
  }

  /** Get cursor row. */
  get cursorRow(): number {
    return this.#term.buffer.active.cursorY;
  }

  /** Cursor visibility (DECTCEM). */
  get cursorVisible(): boolean {
    return true;
  }

  /**
   * Compute dirty lines by diffing current screen against previous snapshot.
   * Called lazily at render time.
   */
  getDirtyLines(): ReadonlySet<number> {
    if (this.#allDirty) {
      const all = new Set<number>();
      for (let r = 0; r < this.#rows; r++) all.add(r);
      return all;
    }

    this.#dirty.clear();
    const buf = this.#term.buffer.active;

    for (let r = 0; r < this.#rows; r++) {
      const line = buf.getLine(r);
      const content = line?.translateToString(true) ?? "";
      if (content !== this.#prevSnapshot[r]) {
        this.#dirty.add(r);
      }
    }

    // Cursor row is always dirty (cursor may have moved)
    this.#dirty.add(this.cursorRow);

    return this.#dirty;
  }

  /** Snapshot current screen for next dirty diff. */
  clearDirty(): void {
    this.#allDirty = false;
    const buf = this.#term.buffer.active;
    for (let r = 0; r < this.#rows; r++) {
      this.#prevSnapshot[r] = buf.getLine(r)?.translateToString(true) ?? "";
    }
  }

  /** Mark all lines dirty. */
  markAllDirty(): void {
    this.#allDirty = true;
  }

  /** Mark a specific line dirty. */
  markLineDirty(row: number): void {
    this.#dirty.add(row);
  }

  // Legacy compatibility for vterm-widget.ts
  getScreen(): VTerminal {
    return this;
  }

  getCursor(): { row: number; col: number; visible: boolean } {
    return {
      row: this.cursorRow,
      col: this.cursorCol,
      visible: this.cursorVisible,
    };
  }
}
