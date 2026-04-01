// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/shell/vterm
 *
 * Virtual terminal emulator -- parses ANSI escape sequences and maintains
 * a 2D character grid. Used by TUI widgets to embed terminal output.
 */

export { type Cell, ScreenBuffer } from "./screen.ts";
export { Cursor } from "./cursor.ts";
export { defaultStyle, parseSGR, type RGB, type TextStyle } from "./sgr.ts";
export { AnsiParser, type ParsedSequence } from "./parser.ts";
export { VTerminal } from "./terminal.ts";
export {
  type RenderOptions,
  renderScreen,
  type RenderState,
} from "./renderer.ts";
