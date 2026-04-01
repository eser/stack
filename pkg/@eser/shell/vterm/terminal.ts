// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * VTerminal -- virtual terminal emulator orchestrator.
 * Parses ANSI sequences and maintains screen/cursor state.
 * @module
 */

import * as screen from "./screen.ts";
import * as cursor from "./cursor.ts";
import * as parser from "./parser.ts";
import * as sgr from "./sgr.ts";

export class VTerminal {
  readonly screen: screen.ScreenBuffer;
  readonly cursor: cursor.Cursor;
  #parser: parser.AnsiParser;
  #style: sgr.TextStyle;

  constructor(rows: number, cols: number) {
    this.screen = new screen.ScreenBuffer(rows, cols);
    this.cursor = new cursor.Cursor();
    this.#parser = new parser.AnsiParser();
    this.#style = sgr.defaultStyle();
  }

  write(data: string): void {
    const sequences = this.#parser.feed(data);
    for (const seq of sequences) {
      switch (seq.type) {
        case "text":
          this.#handleText(seq.text);
          break;
        case "csi":
          this.#handleCSI(seq.command, seq.params);
          break;
        case "esc":
          this.#handleEscape(seq.command);
          break;
        case "control":
          this.#handleControl(seq.code);
          break;
        case "osc":
          break; // OSC (title changes etc.) -- ignore for now
      }
    }
  }

  resize(rows: number, cols: number): void {
    this.screen.resize(rows, cols);
    this.cursor.clamp(rows, cols);
  }

  getScreen(): screen.ScreenBuffer {
    return this.screen;
  }

  getCursor(): cursor.Cursor {
    return this.cursor;
  }

  #handleText(text: string): void {
    for (const ch of text) {
      if (this.cursor.col >= this.screen.cols) {
        // Line wrap
        this.cursor.col = 0;
        this.cursor.row++;
        if (this.cursor.row >= this.screen.rows) {
          this.screen.scrollUp();
          this.cursor.row = this.screen.rows - 1;
        }
      }
      this.screen.setCell(this.cursor.row, this.cursor.col, this.#style, ch);
      this.cursor.col++;
    }
  }

  #handleControl(code: number): void {
    switch (code) {
      case 0x0d: // CR (\r)
        this.cursor.col = 0;
        break;
      case 0x0a: // LF (\n)
        this.cursor.row++;
        if (this.cursor.row >= this.screen.rows) {
          this.screen.scrollUp();
          this.cursor.row = this.screen.rows - 1;
        }
        break;
      case 0x09: // TAB
        this.cursor.col = Math.min(
          this.screen.cols - 1,
          (Math.floor(this.cursor.col / 8) + 1) * 8,
        );
        break;
      case 0x08: // BS (backspace)
        this.cursor.moveBack();
        break;
      case 0x07: // BEL -- ignore
        break;
    }
  }

  #handleCSI(command: string, params: number[]): void {
    const p0 = params[0] ?? 0;
    const p1 = params[1] ?? 0;
    const n = p0 || 1; // default 1 for movement commands

    switch (command) {
      case "A":
        this.cursor.moveUp(n);
        break;
      case "B":
        this.cursor.moveDown(n);
        break;
      case "C":
        this.cursor.moveForward(n);
        break;
      case "D":
        this.cursor.moveBack(n);
        break;
      case "H":
      case "f": // Cursor position
        this.cursor.moveTo((p0 || 1) - 1, (p1 || 1) - 1);
        break;
      case "G": // Cursor column absolute
        this.cursor.moveToColumn((p0 || 1) - 1);
        break;
      case "d": // Cursor row absolute
        this.cursor.moveTo((p0 || 1) - 1, this.cursor.col);
        break;
      case "J": // Erase display
        this.screen.clearDisplay(p0, this.cursor.row, this.cursor.col);
        break;
      case "K": // Erase line
        if (p0 === 0) {
          this.screen.clearLineRange(
            this.cursor.row,
            this.cursor.col,
            this.screen.cols - 1,
          );
        } else if (p0 === 1) {
          this.screen.clearLineRange(this.cursor.row, 0, this.cursor.col);
        } else {
          this.screen.clearLine(this.cursor.row, 2);
        }
        break;
      case "m": // SGR
        this.#style = sgr.parseSGR(
          params.length > 0 ? params : [0],
          this.#style,
        );
        break;
      case "S":
        this.screen.scrollUp(n);
        break;
      case "T":
        this.screen.scrollDown(n);
        break;
      case "L":
        this.screen.insertLines(n, this.cursor.row);
        break;
      case "M":
        this.screen.deleteLines(n, this.cursor.row);
        break;
      case "s":
        this.cursor.save();
        break;
      case "u":
        this.cursor.restore();
        break;
      case "r": // Set scroll region
        this.screen.setScrollRegion(
          (p0 || 1) - 1,
          (p1 || this.screen.rows) - 1,
        );
        break;
      // Private modes
      case "?h": // Set mode
        if (p0 === 25) this.cursor.visible = true;
        if (p0 === 1049) this.screen.enterAlternateScreen();
        break;
      case "?l": // Reset mode
        if (p0 === 25) this.cursor.visible = false;
        if (p0 === 1049) this.screen.exitAlternateScreen();
        break;
    }

    this.cursor.clamp(this.screen.rows, this.screen.cols);
  }

  #handleEscape(command: string): void {
    switch (command) {
      case "7":
        this.cursor.save();
        break;
      case "8":
        this.cursor.restore();
        break;
      case "M": // Reverse index -- scroll down at top
        if (this.cursor.row === 0) {
          this.screen.scrollDown();
        } else {
          this.cursor.moveUp();
        }
        break;
      case "c": // Full reset
        this.screen.clearDisplay(2, 0, 0);
        this.cursor.moveTo(0, 0);
        this.#style = sgr.defaultStyle();
        break;
    }
  }
}
