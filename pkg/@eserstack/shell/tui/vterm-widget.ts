// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * VTermWidget — wraps @eserstack/shell/vterm to provide a TUI-embeddable
 * terminal emulator panel. Feed PTY data in, get rendered ANSI out.
 *
 * @module
 */

import * as vterm from "../vterm/mod.ts";
import type { RenderOptions } from "../vterm/mod.ts";
import type { Panel } from "./layout.ts";

/**
 * A terminal emulator panel for a TUI: write PTY output in, render the screen
 * into a panel as ANSI.
 */
export class VTermWidget {
  #terminal: vterm.VTerminal;
  #dirty = false;

  /**
   * Create a widget backed by a new virtual terminal of the given size.
   *
   * @param rows - Terminal height in rows.
   * @param cols - Terminal width in columns.
   */
  constructor(rows: number, cols: number) {
    this.#terminal = new vterm.VTerminal(rows, cols);
  }

  /** Feed raw PTY data — parses ANSI and updates internal screen. */
  write(data: string): void {
    this.#terminal.write(data);
    this.#dirty = true;
  }

  /**
   * Render the virtual screen inside `panel`'s border.
   *
   * @param fullRedraw - Redraw every line, not only the ones that changed.
   */
  render(panel: Panel, fullRedraw = false): string {
    const opts: RenderOptions = {
      offsetRow: panel.y + 1,
      offsetCol: panel.x + 1,
      width: panel.width - 2,
      height: panel.height - 2,
      fullRedraw,
    };
    this.#dirty = false;
    return vterm.renderScreen(this.#terminal, opts);
  }

  /** Resize the virtual terminal. */
  resize(rows: number, cols: number): void {
    this.#terminal.resize(rows, cols);
    this.#dirty = true;
  }

  /** Has new data since last render? */
  get dirty(): boolean {
    return this.#dirty;
  }

  /** Clear dirty flag. */
  clearDirty(): void {
    this.#dirty = false;
  }

  /** Access underlying terminal for advanced use. */
  get terminal(): vterm.VTerminal {
    return this.#terminal;
  }
}
