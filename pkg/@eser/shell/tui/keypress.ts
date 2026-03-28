// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Raw stdin reader and keypress event parser.
 *
 * Provides `withRawMode()` for Deno raw terminal input, and
 * `readKeypress()` as an async iterable that parses ANSI escape
 * sequences into semantic `KeypressEvent` objects.
 *
 * @module
 */

import type * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type KeypressEvent = {
  readonly name: string;
  readonly char?: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
};

// =============================================================================
// Raw mode
// =============================================================================

/**
 * Execute a function with the terminal in raw mode.
 * Restores normal mode in `finally`, even on error or cancellation.
 * Uses `@eser/standards/cross-runtime` for runtime-agnostic raw mode control.
 */
export const withRawMode = async <T>(fn: () => Promise<T>): Promise<T> => {
  let rawEnabled = false;

  if (runtime.capabilities.stdin && runtime.process.isTerminal("stdin")) {
    try {
      runtime.process.setStdinRaw(true);
      rawEnabled = true;
    } catch {
      // Not a TTY or raw mode not supported
    }
  }

  try {
    return await fn();
  } finally {
    if (rawEnabled) {
      try {
        runtime.process.setStdinRaw(false);
      } catch {
        // stdin may have been closed
      }
    }
  }
};

// =============================================================================
// Cursor control
// =============================================================================

export const hideCursor = (out: streams.Output): void => {
  out.write(span.text("\x1b[?25l"));
};

export const showCursor = (out: streams.Output): void => {
  out.write(span.text("\x1b[?25h"));
};

export const clearLines = (out: streams.Output, count: number): void => {
  if (count > 0) {
    out.write(span.text(`\x1b[${count}A\x1b[J`));
  }
};

export const eraseLine = (out: streams.Output): void => {
  out.write(span.text("\r\x1b[2K"));
};

// =============================================================================
// Keypress parser
// =============================================================================

const parseBytes = (bytes: Uint8Array): KeypressEvent => {
  // Ctrl+C
  if (bytes.length === 1 && bytes[0] === 0x03) {
    return { name: "c", ctrl: true, meta: false, shift: false };
  }

  // Escape alone
  if (bytes.length === 1 && bytes[0] === 0x1b) {
    return { name: "escape", ctrl: false, meta: false, shift: false };
  }

  // Enter / Return
  if (bytes.length === 1 && (bytes[0] === 0x0d || bytes[0] === 0x0a)) {
    return { name: "return", ctrl: false, meta: false, shift: false };
  }

  // Tab
  if (bytes.length === 1 && bytes[0] === 0x09) {
    return { name: "tab", ctrl: false, meta: false, shift: false };
  }

  // Backspace
  if (bytes.length === 1 && bytes[0] === 0x7f) {
    return { name: "backspace", ctrl: false, meta: false, shift: false };
  }

  // ANSI escape sequences: ESC [ ...
  if (bytes.length >= 3 && bytes[0] === 0x1b && bytes[1] === 0x5b) {
    const code = bytes[2];
    switch (code) {
      case 0x41: // A
        return { name: "up", ctrl: false, meta: false, shift: false };
      case 0x42: // B
        return { name: "down", ctrl: false, meta: false, shift: false };
      case 0x43: // C
        return { name: "right", ctrl: false, meta: false, shift: false };
      case 0x44: // D
        return { name: "left", ctrl: false, meta: false, shift: false };
      case 0x48: // H (Home)
        return { name: "home", ctrl: false, meta: false, shift: false };
      case 0x46: // F (End)
        return { name: "end", ctrl: false, meta: false, shift: false };
    }
  }

  // Ctrl+letter (0x01-0x1a)
  if (bytes.length === 1 && bytes[0]! >= 0x01 && bytes[0]! <= 0x1a) {
    const letter = String.fromCharCode(bytes[0]! + 0x60);
    return { name: letter, ctrl: true, meta: false, shift: false };
  }

  // Space
  if (bytes.length === 1 && bytes[0] === 0x20) {
    return { name: "space", char: " ", ctrl: false, meta: false, shift: false };
  }

  // Printable ASCII
  if (bytes.length === 1 && bytes[0]! >= 0x21 && bytes[0]! <= 0x7e) {
    const char = String.fromCharCode(bytes[0]!);
    return { name: char, char, ctrl: false, meta: false, shift: false };
  }

  // Multi-byte UTF-8 printable character
  if (bytes.length > 0 && bytes[0]! >= 0xc0) {
    const char = new TextDecoder().decode(bytes);
    return { name: char, char, ctrl: false, meta: false, shift: false };
  }

  // Unknown
  return { name: "unknown", ctrl: false, meta: false, shift: false };
};

/**
 * Async iterable that yields parsed keypress events from a byte stream.
 * Works with real `Deno.stdin.readable` or a test `ReadableStream`.
 */
export async function* readKeypress(
  input: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<KeypressEvent> {
  const reader = input.getReader();

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done || value === undefined) break;

      yield parseBytes(value);
    }
  } finally {
    reader.releaseLock();
  }
}
