// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FFI-backed TUI event source (Phase B: event source moved to Go).
 *
 * Wraps EserAjanShellTuiKeypress*, EserAjanShellTuiSetStdinRaw, and
 * EserAjanShellTuiGetSize exported by the ajan native library.
 *
 * Option B: throws if the native library is not available (no TS fallback).
 *
 * @module
 */

import { ensureLib, getLib } from "../ffi-client.ts";
import type { KeypressEvent } from "./keypress.ts";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

const requireLib = async () => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error(
      "@eserstack/ajan native library is not available — " +
        "EserAjanShellTui* requires FFI or command-mode WASM",
    );
  }

  return lib;
};

// ---------------------------------------------------------------------------
// readKeypressFFI
// ---------------------------------------------------------------------------

export type KeypressFFIEvent = KeypressEvent & {
  /** Present on "resize" events only. */
  readonly cols?: number;
  readonly rows?: number;
};

/**
 * Async generator that yields keypress events read from os.Stdin via Go FFI.
 * Implements `Symbol.asyncDispose` for use with `await using`.
 *
 * Throws if the native library is not available (Option B — no fallback).
 */
export const readKeypressFFI = async function* (
  signal?: AbortSignal,
): AsyncGenerator<KeypressFFIEvent, void, unknown> {
  const lib = await requireLib();

  const createResult = JSON.parse(
    lib.symbols.EserAjanShellTuiKeypressCreate("{}"),
  ) as { handle?: string; error?: string };

  if (createResult.error !== undefined) {
    throw new Error(createResult.error);
  }

  const handle = createResult.handle!;

  try {
    while (true) {
      if (signal?.aborted) break;

      const raw = lib.symbols.EserAjanShellTuiKeypressRead(handle);

      if (raw === "null") break;

      const ev = JSON.parse(raw) as {
        name: string;
        char?: string;
        ctrl: boolean;
        meta: boolean;
        shift: boolean;
        raw?: string;
        cols?: number;
        rows?: number;
        error?: string;
      };

      if (ev.error !== undefined) throw new Error(ev.error);

      const rawBytes = ev.raw !== undefined
        ? Uint8Array.from(atob(ev.raw), (c) => c.charCodeAt(0))
        : new Uint8Array(0);

      yield {
        name: ev.name,
        char: ev.char,
        ctrl: ev.ctrl,
        meta: ev.meta,
        shift: ev.shift,
        raw: rawBytes,
        cols: ev.cols,
        rows: ev.rows,
      };
    }
  } finally {
    lib.symbols.EserAjanShellTuiKeypressClose(handle);
  }
};

// ---------------------------------------------------------------------------
// setStdinRaw
// ---------------------------------------------------------------------------

/**
 * Enables or disables raw mode on os.Stdin via Go FFI.
 * Throws if the native library is not available (Option B).
 */
export const setStdinRawFFI = async (enable: boolean): Promise<void> => {
  const lib = await requireLib();
  const result = JSON.parse(
    lib.symbols.EserAjanShellTuiSetStdinRaw(JSON.stringify({ enable })),
  ) as { error?: string };

  if (result.error !== undefined) throw new Error(result.error);
};

// ---------------------------------------------------------------------------
// getTerminalSize
// ---------------------------------------------------------------------------

export type TerminalSize = {
  readonly cols: number;
  readonly rows: number;
};

/**
 * Returns the current terminal dimensions via Go FFI.
 * Throws if the native library is not available (Option B).
 */
export const getTerminalSizeFFI = async (): Promise<TerminalSize> => {
  const lib = await requireLib();
  const result = JSON.parse(
    lib.symbols.EserAjanShellTuiGetSize("{}"),
  ) as { cols?: number; rows?: number; error?: string };

  if (result.error !== undefined) throw new Error(result.error);

  return { cols: result.cols!, rows: result.rows! };
};
