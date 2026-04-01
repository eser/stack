// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Reactor-mode WASM loader for the eser-ajan module.
 *
 * Loads the `eser-ajan-reactor.wasm` module which exports functions directly
 * via `//go:wasmexport`. The loader keeps the WASM instance alive and calls
 * exported functions directly — faster than command mode.
 *
 * String return protocol:
 *   1. Call the exported function → returns byte length (i32)
 *   2. Call `eser_ajan_result_ptr()` → returns pointer to result buffer
 *   3. Read `length` bytes from WASM memory at that pointer → decode as UTF-8
 *
 * Works on Node.js, Bun, Deno, and browsers via the built-in WASI shim.
 *
 * @module
 */

import type * as types from "../ffi/types.ts";
import * as wasiShim from "./wasi-shim.ts";

/**
 * Shape of the WASM instance exports for the reactor-mode module.
 */
interface ReactorExports {
  memory: WebAssembly.Memory;
  _start?: () => void;
  _initialize?: () => void;
  eser_ajan_result_ptr: () => number;
  eser_ajan_version: () => number;
  eser_ajan_init: () => number;
  eser_ajan_shutdown: () => void;
  eser_ajan_config_load: () => number;
  eser_ajan_di_resolve: () => number;
}

/**
 * Loads the reactor-mode WASM module and returns an FFILibrary-compatible handle.
 *
 * The WASM instance is kept alive and exported functions are called directly.
 * This is faster than command mode but more complex due to the shared buffer
 * protocol for string returns.
 *
 * @param wasmPath - Absolute path to the `eser-ajan-reactor.wasm` file.
 * @returns An FFILibrary-compatible object.
 */
export const loadReactorWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> => {
  const nodeFs = await import("node:fs");

  // Read and compile the WASM binary
  const wasmBytes = nodeFs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);

  // Create a persistent WASI shim for the reactor lifetime
  const wasi = new wasiShim.WasiShim();

  const instance = new WebAssembly.Instance(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  const exports = instance.exports as unknown as ReactorExports;

  // Initialize the WASI reactor
  wasi.initialize(instance);

  /**
   * Reads a string result from WASM memory using the shared buffer protocol.
   *
   * @param byteLength - Number of bytes returned by the exported function.
   * @returns The decoded UTF-8 string.
   */
  const readResult = (byteLength: number): string => {
    if (byteLength <= 0) {
      return "";
    }

    const ptr = exports.eser_ajan_result_ptr();
    if (ptr === 0) {
      return "";
    }

    const memoryBuffer = new Uint8Array(exports.memory.buffer, ptr, byteLength);
    // Copy the bytes — the buffer may be overwritten on the next call
    const copy = new Uint8Array(byteLength);
    copy.set(memoryBuffer);

    return new TextDecoder().decode(copy);
  };

  return {
    symbols: {
      EserAjanVersion: () => {
        const len = exports.eser_ajan_version();
        return readResult(len);
      },
      EserAjanInit: () => {
        return exports.eser_ajan_init();
      },
      EserAjanShutdown: () => {
        exports.eser_ajan_shutdown();
      },
      EserAjanFree: (_ptr: unknown) => {
        // No-op in WASM mode — Go's GC handles memory.
      },
      EserAjanConfigLoad: (_path: string) => {
        // Reactor mode currently doesn't support string args for config_load.
        // The Go side reads an empty path. A future shared-memory protocol
        // will enable passing string args.
        const len = exports.eser_ajan_config_load();
        return readResult(len);
      },
      EserAjanDIResolve: (_name: string) => {
        // Same limitation as config_load — string args not yet supported.
        const len = exports.eser_ajan_di_resolve();
        return readResult(len);
      },
    },
    close: () => {
      // The WASM instance will be garbage collected.
      // No explicit cleanup needed.
    },
  };
};
