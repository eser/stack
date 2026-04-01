// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Terminal control primitives — alternate screen, cursor visibility,
 * screen clear, and size detection.
 *
 * All functions return ANSI escape strings or read-only terminal state.
 * No side effects — the caller decides when to write to stdout.
 *
 * @module
 */

/** Switch to the alternate screen buffer. */
export const enterAlternateScreen = (): string => "\x1b[?1049h";

/** Switch back from the alternate screen buffer. */
export const exitAlternateScreen = (): string => "\x1b[?1049l";

/** Hide the terminal cursor. */
export const hideCursorSeq = (): string => "\x1b[?25l";

/** Show the terminal cursor. */
export const showCursorSeq = (): string => "\x1b[?25h";

/** Clear the entire screen and move cursor to top-left. */
export const clearScreenSeq = (): string => "\x1b[2J\x1b[H";

/** Read current terminal dimensions, falling back to 80x24 if unavailable. */
export const getTerminalSize = (): { cols: number; rows: number } => {
  try {
    const { columns, rows } = Deno.consoleSize();
    return { cols: columns, rows };
  } catch {
    return { cols: 80, rows: 24 };
  }
};
