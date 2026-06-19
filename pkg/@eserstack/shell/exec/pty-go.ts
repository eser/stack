// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FFI-backed PTY implementing the {@link PtyProcess} contract via the native
 * EserAjanShellPty* exports (ConPTY on Windows, openpty on Unix, with working
 * resize). Mirrors child-go.ts: a deferred poll pump reads one merged chunk at a
 * time. The read symbol is nonblocking on Deno, so an idle PTY never stalls the
 * isolate or starves other panes' pumps.
 *
 * Spawn errors propagate to the caller so {@link spawnPty} can fall back to the
 * script-based implementation when the native library is unavailable.
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import { ensureLib, getLib } from "../ffi-client.ts";
import type { PtyOptions, PtyProcess } from "./pty.ts";

const requireLib = async (): Promise<ffiTypes.FFILibrary> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error(
      "@eserstack/ajan native library is not available — " +
        "EserAjanShellPty* requires FFI or command-mode WASM",
    );
  }

  return lib;
};

/** Base64-encode bytes without the spread operator (safe for large writes). */
const toBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }

  return btoa(bin);
};

const fromBase64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const spawnPtyGo = async (opts: PtyOptions): Promise<PtyProcess> => {
  const lib = await requireLib();

  const env: string[] = Object.entries({
    ...opts.env,
    TERM: "xterm-256color",
    COLUMNS: String(opts.cols ?? 80),
    LINES: String(opts.rows ?? 24),
  }).map(([k, v]) => `${k}=${v}`);

  const spawnResult = JSON.parse(
    lib.symbols.EserAjanShellPtySpawn(
      JSON.stringify({
        command: opts.command,
        args: opts.args ?? [],
        cwd: opts.cwd ?? "",
        env,
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
      }),
    ),
  ) as { handle?: string; pid?: number; error?: string };

  if (spawnResult.error !== undefined) {
    throw new Error(spawnResult.error);
  }

  const handle = spawnResult.handle!;
  const pid = spawnResult.pid ?? -1;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const callbacks: ((data: string) => void)[] = [];

  let exited = false;
  let resolveExit!: (code: number) => void;
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  const finish = (): void => {
    if (exited) return;
    exited = true;

    // Flush any partial multibyte sequence left in the streaming decoder so a
    // final character split across the last chunk boundary isn't dropped.
    const tail = decoder.decode();
    if (tail.length > 0) {
      for (const cb of callbacks) cb(tail);
    }

    let code = -1;
    try {
      const r = JSON.parse(lib.symbols.EserAjanShellPtyClose(handle)) as {
        code?: number;
      };
      code = r.code ?? -1;
    } catch {
      // handle already gone
    }

    resolveExit(code);
  };

  // Poll pump — the nonblocking read awaits off-isolate; each resolution yields
  // back to the event loop so other panes/input keep flowing.
  const pump = async (): Promise<void> => {
    try {
      while (true) {
        const raw = await lib.symbols.EserAjanShellPtyRead(handle);

        if (raw === "null") break;

        let ev: { chunk?: string; error?: string };
        try {
          ev = JSON.parse(raw) as { chunk?: string; error?: string };
        } catch {
          break;
        }

        if (ev.error !== undefined) break;

        if (ev.chunk !== undefined && ev.chunk.length > 0) {
          const text = decoder.decode(fromBase64(ev.chunk), { stream: true });
          for (const cb of callbacks) cb(text);
        }
      }
    } finally {
      finish();
    }
  };

  let started = false;
  const ensureStarted = (): void => {
    if (started) return;
    started = true;
    void pump();
  };

  return {
    onData(callback: (data: string) => void): void {
      callbacks.push(callback);
      ensureStarted();
    },

    write(data: string): void {
      try {
        lib.symbols.EserAjanShellPtyWrite(
          JSON.stringify({ handle, data: toBase64(encoder.encode(data)) }),
        );
      } catch {
        // PTY may have closed
      }
    },

    resize(cols: number, rows: number): void {
      try {
        lib.symbols.EserAjanShellPtyResize(
          JSON.stringify({ handle, cols, rows }),
        );
      } catch {
        // PTY may have closed
      }
    },

    kill(signal?: string): void {
      try {
        lib.symbols.EserAjanShellPtyKill(
          JSON.stringify({ handle, signal: signal ?? "SIGTERM" }),
        );
      } catch {
        // PTY may have already exited
      }
      // Ensure teardown even if no consumer ever registered onData: starting the
      // pump lets it observe EOF and run finish(), which closes the native handle
      // and resolves exitCode. Without this, a kill() before any onData() would
      // leak the handle/child and leave exitCode pending forever.
      ensureStarted();
    },

    get pid(): number {
      return pid;
    },

    get exitCode(): Promise<number> {
      return exitPromise;
    },
  };
};
