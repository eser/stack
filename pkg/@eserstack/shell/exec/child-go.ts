// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FFI-backed ChildProcess implementation using EserAjanShellExecSpawn/Read/Write/Close.
 *
 * Option B: throws if the native library is not available (no TS fallback).
 *
 * Both stdout and stderr are separate ReadableStream<Uint8Array>, fed by a shared
 * pull pump that routes chunks tagged { stream: "stdout"|"stderr" } from the FFI.
 *
 * Two entry points:
 *  - spawnChildGoSync(lib, opts) — synchronous core; takes a pre-loaded FFILibrary.
 *    Used by CommandBuilder.child() which must stay synchronous.
 *  - spawnChildGo(opts)          — async convenience wrapper; calls requireLib() itself.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import { ensureLib, getLib } from "../ffi-client.ts";

const requireLib = async (): Promise<ffiTypes.FFILibrary> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error(
      "@eserstack/ajan native library is not available — " +
        "EserAjanShellExec* requires FFI or command-mode WASM",
    );
  }

  return lib;
};

export interface SpawnGoOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: readonly string[];
}

const mergeChunks = (chunks: Uint8Array[]): Uint8Array => {
  const total = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    total.set(c, off);
    off += c.length;
  }
  return total;
};

const readAll = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> => {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
};

/**
 * Synchronous core — takes a pre-loaded FFILibrary so no async I/O is required.
 * CommandBuilder.child() uses this directly after a sync null-lib check (Option B).
 */
export const spawnChildGoSync = (
  lib: ffiTypes.FFILibrary,
  opts: SpawnGoOptions,
): standardsCrossRuntime.ChildProcess => {
  const spawnResult = JSON.parse(
    lib.symbols.EserAjanShellExecSpawn(
      JSON.stringify({
        command: opts.command,
        args: opts.args ?? [],
        cwd: opts.cwd ?? "",
        env: opts.env ?? [],
      }),
    ),
  ) as { handle?: string; pid?: number; error?: string };

  if (spawnResult.error !== undefined) {
    throw new Error(spawnResult.error);
  }

  const handle = spawnResult.handle!;
  const pid = spawnResult.pid!;

  // closeHandle may only be called once — guards double-close.
  let closed = false;

  const closeHandle = (): number => {
    if (closed) return -1;
    closed = true;
    const result = JSON.parse(
      lib.symbols.EserAjanShellExecClose(handle),
    ) as { code?: number; error?: string };
    return result.code ?? -1;
  };

  let resolveStatus!: (s: standardsCrossRuntime.ProcessStatus) => void;
  const statusPromise = new Promise<standardsCrossRuntime.ProcessStatus>(
    (resolve) => {
      resolveStatus = resolve;
    },
  );

  // Both controllers are initialized synchronously in their `start` callbacks,
  // which fire when the ReadableStream constructors run below.
  let stdoutCtrl!: ReadableStreamDefaultController<Uint8Array>;
  let stderrCtrl!: ReadableStreamDefaultController<Uint8Array>;
  let streamDone = false;

  const closeStreams = (code: number): void => {
    if (streamDone) return;
    streamDone = true;
    resolveStatus({ success: code === 0, code });
    stdoutCtrl.close();
    stderrCtrl.close();
  };

  // readNext reads one tagged chunk and routes it. JS single-thread guarantees
  // calls from two stream consumers never interleave.
  const readNext = (): void => {
    if (streamDone) return;

    const raw = lib.symbols.EserAjanShellExecRead(handle);

    if (raw === "null") {
      closeStreams(closeHandle());
      return;
    }

    const ev = JSON.parse(raw) as {
      stream?: string;
      chunk?: string;
      error?: string;
    };

    if (ev.error !== undefined) {
      if (streamDone) return;
      streamDone = true;
      const err = new Error(ev.error);
      stdoutCtrl.error(err);
      stderrCtrl.error(err);
      return;
    }

    const bytes = Uint8Array.from(
      atob(ev.chunk ?? ""),
      (c) => c.charCodeAt(0),
    );

    if (ev.stream === "stderr") {
      stderrCtrl.enqueue(bytes);
    } else {
      stdoutCtrl.enqueue(bytes);
    }
  };

  const stdout = new ReadableStream<Uint8Array>({
    start(ctrl) {
      stdoutCtrl = ctrl;
    },
    pull() {
      readNext();
    },
  });

  const stderr = new ReadableStream<Uint8Array>({
    start(ctrl) {
      stderrCtrl = ctrl;
    },
    pull() {
      readNext();
    },
  });

  const stdin = new WritableStream<Uint8Array>({
    write(chunk) {
      const encoded = btoa(String.fromCharCode(...chunk));
      const result = JSON.parse(
        lib.symbols.EserAjanShellExecWrite(
          JSON.stringify({ handle, data: encoded }),
        ),
      ) as { error?: string };

      if (result.error !== undefined) {
        throw new Error(result.error);
      }
    },
  });

  return {
    pid,
    stdin,
    stdout,
    stderr,
    status: statusPromise,

    async output(): Promise<standardsCrossRuntime.ProcessOutput> {
      const [stdoutChunks, stderrChunks] = await Promise.all([
        readAll(stdout),
        readAll(stderr),
      ]);

      const status = await statusPromise;

      return {
        ...status,
        stdout: mergeChunks(stdoutChunks),
        stderr: mergeChunks(stderrChunks),
      };
    },

    kill(_signal?: string): void {
      const code = closeHandle();
      closeStreams(code);
    },
  };
};

/**
 * Async convenience wrapper — loads the library itself.
 * Use when not going through CommandBuilder.
 */
export const spawnChildGo = async (
  opts: SpawnGoOptions,
): Promise<standardsCrossRuntime.ChildProcess> => {
  const lib = await requireLib();
  return spawnChildGoSync(lib, opts);
};
