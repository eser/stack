// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * PTY spawner — creates a real pseudo-terminal using the `script` command.
 *
 * On macOS: `script -q /dev/null <command> <args>`
 * On Linux: `script -qc "<command> <args>" /dev/null`
 *
 * Falls back to piped I/O on platforms where `script` is not available.
 * Uses `@eserstack/standards/cross-runtime` for OS detection and process spawning.
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import { ensureLib, getLib } from "../ffi-client.ts";
import { spawnPtyGo } from "./pty-go.ts";

// =============================================================================
// Types
// =============================================================================

export type PtyOptions = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly cols?: number;
  readonly rows?: number;
};

export type PtyProcess = {
  onData(callback: (data: string) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  readonly pid: number;
  readonly exitCode: Promise<number>;
};

// =============================================================================
// Script noise patterns to strip from output
// =============================================================================

/** macOS `script` emits control chars at start — strip \x04 (EOT) */
// deno-lint-ignore no-control-regex
const STRIP_PATTERN = /\x04/g;

/** macOS `script` may emit "Script started/done" lines even with -q on some versions */
const SCRIPT_NOISE_PATTERN =
  /^Script (started|done),? ?(output file is )?[^\n]*\n?/gm;

/** `script` emits tcgetattr/ioctl errors when stdin is a pipe/socket — suppress them */
const TCGETATTR_NOISE_PATTERN = /^script: tcgetattr[^\n]*\n?/gm;

const cleanOutput = (text: string): string =>
  text
    .replace(STRIP_PATTERN, "")
    .replace(SCRIPT_NOISE_PATTERN, "")
    .replace(TCGETATTR_NOISE_PATTERN, "");

// =============================================================================
// PTY command builder
// =============================================================================

type WrappedCommand = {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly usesScript: boolean;
};

/**
 * Build the PTY wrapper command for the current platform.
 * Uses `script` on macOS/Linux for a real PTY.
 */
const buildPtyCommand = (
  command: string,
  args: readonly string[],
): WrappedCommand => {
  const platform = crossRuntime.getPlatform();

  if (platform === "darwin") {
    // macOS: wrap in sh to suppress script's tcgetattr stderr warning.
    // When stdin is a pipe, `script` prints "tcgetattr: Operation not
    // supported on socket" to stderr but still creates the PTY correctly.
    // Redirect stderr to suppress noise while keeping stdin piped for
    // programmatic keystroke forwarding.
    const escapedArgs = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`);
    const innerCmd = [command, ...escapedArgs].join(" ");
    return {
      cmd: "sh",
      args: ["-c", `script -q /dev/null ${innerCmd} 2>/dev/null`],
      usesScript: true,
    };
  }

  if (platform === "linux") {
    // Linux: script -qc "<command> <args...>" /dev/null
    // Same stderr suppression for tcgetattr noise.
    const fullCmd = args.length > 0
      ? `${command} ${
        args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")
      }`
      : command;
    return {
      cmd: "sh",
      args: [
        "-c",
        `script -qc '${fullCmd.replace(/'/g, "'\\''")}' /dev/null 2>/dev/null`,
      ],
      usesScript: true,
    };
  }

  // Windows or unknown — direct spawn (no PTY)
  return { cmd: command, args, usesScript: false };
};

// =============================================================================
// Spawn
// =============================================================================

/**
 * Spawn a process with a real PTY.
 *
 * Prefers the native FFI PTY (ConPTY on Windows, openpty on Unix, with working
 * resize) when the @eserstack/ajan library loads, and falls back to the
 * `script`-wrapper implementation otherwise. Set `ESERSTACK_PTY=script` to force
 * the fallback path for debugging.
 *
 * The child process sees a real terminal (isatty=true), enabling interactive
 * programs like Claude Code to run in full interactive mode.
 */
export const spawnPty = async (opts: PtyOptions): Promise<PtyProcess> => {
  let force: string | undefined;
  try {
    force = crossRuntime.runtime.env.get("ESERSTACK_PTY");
  } catch {
    // env not accessible — ignore
  }

  let nativeAvailable = false;
  if (force !== "script") {
    try {
      await ensureLib();
      nativeAvailable = getLib() !== null;
    } catch {
      // native library not loadable — fall back to script
      nativeAvailable = false;
    }
  }

  if (nativeAvailable) {
    // The native library is loaded: use it and let genuine spawn errors (e.g. a
    // missing command) propagate to the caller, rather than masking them behind
    // a different, less specific failure from the script fallback.
    return await spawnPtyGo(opts);
  }

  return spawnPtyScript(opts);
};

/**
 * Spawn a process with a real PTY via the `script` wrapper (fallback path).
 */
// deno-lint-ignore require-await
const spawnPtyScript = async (opts: PtyOptions): Promise<PtyProcess> => {
  const { runtime } = crossRuntime;
  const userArgs = opts.args !== undefined ? [...opts.args] : [];
  const wrapped = buildPtyCommand(opts.command, userArgs);

  const env: Record<string, string> = {
    ...opts.env,
    TERM: "xterm-256color",
    COLUMNS: String(opts.cols ?? 80),
    LINES: String(opts.rows ?? 24),
  };

  const child = runtime.exec.spawnChild(wrapped.cmd, [...wrapped.args], {
    cwd: opts.cwd,
    env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const dataCallbacks: ((data: string) => void)[] = [];
  let streamsStarted = false;

  const dispatch = (raw: string): void => {
    const text = wrapped.usesScript ? cleanOutput(raw) : raw;
    if (text.length === 0) return; // skip empty after cleaning
    for (const cb of dataCallbacks) cb(text);
  };

  // Read a stream in background
  const readStream = async (
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dispatch(decoder.decode(value));
      }
    } catch {
      // Stream closed
    } finally {
      reader.releaseLock();
    }
  };

  // Deferred: start reading only after first onData registration
  const ensureStreamsStarted = (): void => {
    if (streamsStarted) return;
    streamsStarted = true;
    if (child.stdout) readStream(child.stdout);
    if (child.stderr) readStream(child.stderr);
  };

  // Get stdin writer
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  if (child.stdin) {
    writer = child.stdin.getWriter();
  }

  return {
    onData(callback: (data: string) => void): void {
      dataCallbacks.push(callback);
      ensureStreamsStarted();
    },

    write(data: string): void {
      writer?.write(encoder.encode(data)).catch(() => {
        // stdin may be closed
      });
    },

    resize(_cols: number, _rows: number): void {
      // script-based PTY doesn't support dynamic resize
      // Future: could use SIGWINCH + stty
    },

    kill(signal?: string): void {
      try {
        child.kill(signal === "SIGKILL" ? "SIGKILL" : "SIGTERM");
      } catch {
        // Process may have already exited
      }
    },

    get pid(): number {
      return child.pid;
    },

    get exitCode(): Promise<number> {
      return child.status.then((s: { code: number }) => s.code);
    },
  };
};
