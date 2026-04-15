// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Minimal WASI preview1 shim for Go WASM modules.
 *
 * Provides just enough of the `wasi_snapshot_preview1` ABI to bootstrap
 * Go's wasip1 runtime. Works on all runtimes (Deno, Node, Bun, browsers)
 * without depending on `node:wasi`.
 *
 * Two modes:
 * - **Command mode**: stdin contains input data, stdout collects output data.
 * - **Reactor mode**: no I/O needed, just bootstraps the Go runtime.
 *
 * @module
 */

// WASI errno constants
const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;

/** Options for creating a WASI shim instance. */
export interface WasiShimOptions {
  /** Data to provide on stdin (for command mode). */
  stdin?: Uint8Array;
  /** Arguments passed to the WASM module. */
  args?: string[];
  /** Environment variables. */
  env?: Record<string, string>;
}

/**
 * A minimal WASI shim that provides the `wasi_snapshot_preview1` imports.
 */
export class WasiShim {
  private stdinData: Uint8Array;
  private stdinOffset = 0;
  private stdoutChunks: Uint8Array[] = [];
  private stderrChunks: Uint8Array[] = [];
  private instance: WebAssembly.Instance | null = null;
  private exitCode: number | null = null;

  constructor(options: WasiShimOptions = {}) {
    this.stdinData = options.stdin ?? new Uint8Array(0);
  }

  /** Returns the collected stdout output as a UTF-8 string. */
  getStdout(): string {
    const totalLen = this.stdoutChunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.stdoutChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(result);
  }

  /** Returns the exit code if the module called `proc_exit`, or null. */
  getExitCode(): number | null {
    return this.exitCode;
  }

  /** Returns the WASM memory view. */
  private getMemory(): DataView {
    if (this.instance === null) {
      throw new Error("WASI shim: instance not set");
    }
    const memory = this.instance.exports["memory"] as WebAssembly.Memory;
    return new DataView(memory.buffer);
  }

  /** Returns raw bytes from WASM memory. */
  private getMemoryBytes(): Uint8Array {
    if (this.instance === null) {
      throw new Error("WASI shim: instance not set");
    }
    const memory = this.instance.exports["memory"] as WebAssembly.Memory;
    return new Uint8Array(memory.buffer);
  }

  /**
   * Sets the WebAssembly instance. Must be called before starting the module.
   */
  setInstance(instance: WebAssembly.Instance): void {
    this.instance = instance;
  }

  /**
   * Starts the WASM module by calling `_start`.
   * Catches `proc_exit(0)` as normal termination.
   */
  start(instance: WebAssembly.Instance): void {
    this.setInstance(instance);
    const start = instance.exports["_start"] as (() => void) | undefined;
    if (typeof start !== "function") {
      throw new Error("WASI shim: no _start export found");
    }
    try {
      start();
    } catch (err) {
      // Go wasip1 calls proc_exit(0) on normal termination
      if (err instanceof WasiExitError) {
        this.exitCode = err.code;
        if (err.code !== 0) {
          throw err;
        }
        return;
      }
      throw err;
    }
  }

  /**
   * Initializes a reactor-mode WASM module by calling `_initialize`.
   */
  initialize(instance: WebAssembly.Instance): void {
    this.setInstance(instance);
    const init = instance.exports["_initialize"] as (() => void) | undefined;
    if (typeof init === "function") {
      init();
      return;
    }
    // Fallback: try _start (some Go wasip1 builds only have _start)
    const start = instance.exports["_start"] as (() => void) | undefined;
    if (typeof start === "function") {
      try {
        start();
      } catch (err) {
        if (err instanceof WasiExitError && err.code === 0) {
          return;
        }
        throw err;
      }
    }
  }

  /**
   * The WASI snapshot preview1 import object.
   */
  // deno-lint-ignore no-explicit-any
  get wasiImport(): Record<string, (...args: any[]) => number | void> {
    return {
      // -- I/O --
      fd_write: (
        fd: number,
        iovsPtr: number,
        iovsLen: number,
        nwrittenPtr: number,
      ): number => {
        const view = this.getMemory();
        const mem = this.getMemoryBytes();
        let totalWritten = 0;

        for (let i = 0; i < iovsLen; i++) {
          const base = iovsPtr + i * 8;
          const bufPtr = view.getUint32(base, true);
          const bufLen = view.getUint32(base + 4, true);
          const bytes = mem.slice(bufPtr, bufPtr + bufLen);

          if (fd === 1) {
            // stdout
            this.stdoutChunks.push(bytes);
          } else if (fd === 2) {
            // stderr
            this.stderrChunks.push(bytes);
          } else {
            return ERRNO_BADF;
          }
          totalWritten += bufLen;
        }

        view.setUint32(nwrittenPtr, totalWritten, true);
        return ERRNO_SUCCESS;
      },

      fd_read: (
        fd: number,
        iovsPtr: number,
        iovsLen: number,
        nreadPtr: number,
      ): number => {
        if (fd !== 0) return ERRNO_BADF;

        const view = this.getMemory();
        const mem = this.getMemoryBytes();
        let totalRead = 0;

        for (let i = 0; i < iovsLen; i++) {
          const base = iovsPtr + i * 8;
          const bufPtr = view.getUint32(base, true);
          const bufLen = view.getUint32(base + 4, true);

          const remaining = this.stdinData.length - this.stdinOffset;
          const toRead = Math.min(bufLen, remaining);

          if (toRead > 0) {
            mem.set(
              this.stdinData.subarray(
                this.stdinOffset,
                this.stdinOffset + toRead,
              ),
              bufPtr,
            );
            this.stdinOffset += toRead;
            totalRead += toRead;
          }

          if (toRead < bufLen) break; // EOF
        }

        view.setUint32(nreadPtr, totalRead, true);
        return ERRNO_SUCCESS;
      },

      fd_close: (_fd: number): number => ERRNO_SUCCESS,
      fd_seek: (
        _fd: number,
        _offset: number,
        _offsetHi: number,
        _whence: number,
        _newOffsetPtr: number,
      ): number => ERRNO_NOSYS,
      fd_fdstat_get: (fd: number, bufPtr: number): number => {
        const view = this.getMemory();
        // filetype: character device (2) for stdio
        view.setUint8(bufPtr, 2);
        // flags
        view.setUint16(bufPtr + 2, 0, true);
        // rights base (all rights)
        view.setBigUint64(bufPtr + 8, BigInt(0), true);
        // rights inheriting
        view.setBigUint64(bufPtr + 16, BigInt(0), true);

        if (fd <= 2) return ERRNO_SUCCESS;
        return ERRNO_BADF;
      },
      fd_fdstat_set_flags: (_fd: number, _flags: number): number =>
        ERRNO_SUCCESS,
      fd_prestat_get: (_fd: number, _bufPtr: number): number => ERRNO_BADF,
      fd_prestat_dir_name: (
        _fd: number,
        _pathPtr: number,
        _pathLen: number,
      ): number => ERRNO_BADF,

      // -- Process --
      proc_exit: (code: number): void => {
        this.exitCode = code;
        throw new WasiExitError(code);
      },

      // -- Clock --
      // WASI preview1: clock_time_get(clock_id: u32, precision: u64, timestamp_ptr: u32) -> errno
      // In WASM, u64 is passed as BigInt (i64). Go 1.24+ wasip1 uses native i64.
      clock_time_get: (
        _clockId: number,
        _precision: bigint,
        timePtr: number,
      ): number => {
        const view = this.getMemory();
        const now = BigInt(Date.now()) * BigInt(1_000_000); // ms → ns
        view.setBigUint64(timePtr, now, true);
        return ERRNO_SUCCESS;
      },

      // -- Environment --
      environ_sizes_get: (countPtr: number, bufSizePtr: number): number => {
        const view = this.getMemory();
        view.setUint32(countPtr, 0, true);
        view.setUint32(bufSizePtr, 0, true);
        return ERRNO_SUCCESS;
      },
      environ_get: (_environPtr: number, _environBufPtr: number): number =>
        ERRNO_SUCCESS,

      args_sizes_get: (countPtr: number, bufSizePtr: number): number => {
        const view = this.getMemory();
        view.setUint32(countPtr, 0, true);
        view.setUint32(bufSizePtr, 0, true);
        return ERRNO_SUCCESS;
      },
      args_get: (_argvPtr: number, _argvBufPtr: number): number =>
        ERRNO_SUCCESS,

      // -- Unsupported stubs --
      path_open: (): number => ERRNO_NOSYS,
      path_filestat_get: (): number => ERRNO_NOSYS,
      path_create_directory: (): number => ERRNO_NOSYS,
      path_remove_directory: (): number => ERRNO_NOSYS,
      path_unlink_file: (): number => ERRNO_NOSYS,
      path_rename: (): number => ERRNO_NOSYS,
      path_readlink: (): number => ERRNO_NOSYS,
      path_symlink: (): number => ERRNO_NOSYS,
      fd_readdir: (): number => ERRNO_NOSYS,
      fd_filestat_get: (): number => ERRNO_NOSYS,
      fd_filestat_set_size: (): number => ERRNO_NOSYS,
      fd_filestat_set_times: (): number => ERRNO_NOSYS,
      fd_advise: (): number => ERRNO_NOSYS,
      fd_allocate: (): number => ERRNO_NOSYS,
      fd_datasync: (): number => ERRNO_NOSYS,
      fd_sync: (): number => ERRNO_NOSYS,
      fd_pread: (): number => ERRNO_NOSYS,
      fd_pwrite: (): number => ERRNO_NOSYS,
      fd_renumber: (): number => ERRNO_NOSYS,
      fd_tell: (): number => ERRNO_NOSYS,
      poll_oneoff: (
        inPtr: number,
        outPtr: number,
        nsubscriptions: number,
        neventsPtr: number,
      ): number => {
        // Minimal poll_oneoff: immediately mark all subscriptions as ready.
        // Go's wasip1 uses this for sleep/timer and goroutine scheduling.
        // Each event output is 32 bytes in wasi_snapshot_preview1.
        const view = this.getMemory();

        for (let i = 0; i < nsubscriptions; i++) {
          const subBase = inPtr + i * 48; // subscription is 48 bytes
          const eventBase = outPtr + i * 32; // event is 32 bytes

          // Copy userdata from subscription to event
          const userdata = view.getBigUint64(subBase, true);
          view.setBigUint64(eventBase, userdata, true);

          // error: success (0)
          view.setUint16(eventBase + 8, 0, true);
          // type: copy from subscription (offset 8 is the type field)
          view.setUint8(eventBase + 10, view.getUint8(subBase + 8));
        }

        view.setUint32(neventsPtr, nsubscriptions, true);
        return ERRNO_SUCCESS;
      },
      random_get: (bufPtr: number, bufLen: number): number => {
        const mem = this.getMemoryBytes();
        const randomBytes = new Uint8Array(bufLen);
        crypto.getRandomValues(randomBytes);
        mem.set(randomBytes, bufPtr);
        return ERRNO_SUCCESS;
      },
      sched_yield: (): number => ERRNO_SUCCESS,
      sock_accept: (): number => ERRNO_NOSYS,
      sock_recv: (): number => ERRNO_NOSYS,
      sock_send: (): number => ERRNO_NOSYS,
      sock_shutdown: (): number => ERRNO_NOSYS,
    };
  }
}

/**
 * Error thrown when the WASM module calls `proc_exit`.
 */
export class WasiExitError extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`WASI proc_exit(${code})`);
    this.name = "WasiExitError";
    this.code = code;
  }
}
