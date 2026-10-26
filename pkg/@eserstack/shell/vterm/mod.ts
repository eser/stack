// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eserstack/shell/vterm
 *
 * Virtual terminal emulator — powered by @xterm/headless for 100% terminal
 * compatibility. Parses all ANSI escape sequences and maintains a 2D
 * character grid. Used by TUI widgets to embed terminal output.
 */

export { VTerminal } from "./terminal.ts";
export {
  type RenderOptions,
  renderScreen,
  type RenderState,
} from "./renderer.ts";
