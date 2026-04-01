// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Mouse event support — SGR extended mouse mode parsing and control.
 *
 * Supports button press/release, motion, wheel, and modifier keys.
 * Uses SGR extended coordinates (\x1b[<...M/m) for coords > 223.
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

export type MouseEvent = {
  readonly type: "mousedown" | "mouseup" | "mousemove" | "wheel";
  readonly button: 0 | 1 | 2;
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly direction?: "up" | "down";
};

// =============================================================================
// Enable / Disable
// =============================================================================

/** Enable SGR extended mouse reporting (press, release, motion, scroll). */
export const enableMouse = (): string =>
  "\x1b[?1000h" + // button press/release
  "\x1b[?1002h" + // button motion tracking
  "\x1b[?1006h"; // SGR extended coordinates

/** Disable mouse reporting. */
export const disableMouse = (): string =>
  "\x1b[?1006l" +
  "\x1b[?1002l" +
  "\x1b[?1000l";

// =============================================================================
// Parser
// =============================================================================

/** SGR mouse sequence regex: \x1b[<{code};{x};{y}[Mm] */
// deno-lint-ignore no-control-regex
const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

/**
 * Parse an SGR mouse sequence into a MouseEvent.
 * Returns null if the input is not a valid mouse sequence.
 *
 * Format: \x1b[<{code};{col};{row}M (press) or m (release)
 * Code bits: 0-1 = button, 2 = shift, 4 = meta, 8 = ctrl (mapped to bit 4),
 *            16 = ctrl, 32 = motion, 64 = wheel
 */
export const parseMouseEvent = (data: string): MouseEvent | null => {
  const match = data.match(SGR_MOUSE_RE);
  if (match === null) return null;

  const code = parseInt(match[1]!, 10);
  const x = parseInt(match[2]!, 10) - 1; // 1-based → 0-based
  const y = parseInt(match[3]!, 10) - 1;
  const isRelease = match[4] === "m";

  const button = (code & 3) as 0 | 1 | 2;
  const shift = (code & 4) !== 0;
  const ctrl = (code & 16) !== 0;
  const isMotion = (code & 32) !== 0;
  const isWheel = (code & 64) !== 0;

  if (isWheel) {
    return {
      type: "wheel",
      button: 0,
      x,
      y,
      shift,
      ctrl,
      direction: (code & 1) !== 0 ? "down" : "up",
    };
  }

  if (isMotion) {
    return { type: "mousemove", button, x, y, shift, ctrl };
  }

  return {
    type: isRelease ? "mouseup" : "mousedown",
    button,
    x,
    y,
    shift,
    ctrl,
  };
};

/**
 * Check if raw bytes look like an SGR mouse sequence start.
 * Used by the keypress reader to route to mouse parser.
 */
export const isSGRMouseSequence = (data: Uint8Array): boolean => {
  // \x1b [ < ...
  return data.length >= 4 &&
    data[0] === 0x1b &&
    data[1] === 0x5b && // [
    data[2] === 0x3c; // <
};
