// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command-mode WASM loader for the eser-ajan module.
 *
 * Loads the `eser-ajan.wasm` module which uses a JSON stdin/stdout protocol.
 * For each function call, the loader:
 *   1. Encodes a JSON request as stdin bytes
 *   2. Instantiates the WASM module with the WASI shim
 *   3. Runs `_start` to process the request
 *   4. Reads the JSON response from the captured stdout
 *
 * Works on Node.js, Bun, Deno, and browsers via the built-in WASI shim.
 *
 * @module
 */

import type * as types from "../ffi/types.ts";
import * as wasiShim from "./wasi-shim.ts";

/**
 * JSON request envelope matching the Go `request` struct in main_wasi.go.
 */
interface WasiRequest {
  fn: string;
  args?: Record<string, string>;
}

/**
 * JSON response envelope matching the Go `response` struct in main_wasi.go.
 */
interface WasiResponse {
  ok: boolean;
  result?: string;
  error?: string;
}

/**
 * Loads the command-mode WASM module and returns an FFILibrary-compatible handle.
 *
 * Each symbol call instantiates a fresh WASI shim with the request piped
 * through stdin, then reads the JSON response from captured stdout. This is
 * simpler but slower than the reactor-mode loader.
 *
 * @param wasmPath - Absolute path to the `eser-ajan.wasm` file.
 * @returns An FFILibrary-compatible object.
 */
export const loadCommandWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> => {
  const nodeFs = await import("node:fs");

  // Read the WASM binary once and compile it for reuse
  const wasmBytes = nodeFs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);

  /**
   * Invokes a function in the command-mode WASM module.
   *
   * Creates a fresh WASI shim per call with stdin pre-loaded from
   * the serialized request, then reads stdout for the response.
   */
  const invoke = (request: WasiRequest): WasiResponse => {
    const requestJson = JSON.stringify(request);
    const stdinBytes = new TextEncoder().encode(requestJson);

    const wasi = new wasiShim.WasiShim({ stdin: stdinBytes });

    const instance = new WebAssembly.Instance(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    // Run the WASM module — _start reads stdin, processes, writes stdout
    wasi.start(instance);

    // Read the response from captured stdout
    const responseText = wasi.getStdout().trim();

    if (responseText.length === 0) {
      return { ok: false, error: "WASM module produced no output" };
    }

    return JSON.parse(responseText) as WasiResponse;
  };

  /**
   * Invokes a function and returns the result string.
   * Throws on error responses.
   */
  const call = (fn: string, args?: Record<string, string>): string => {
    const request: WasiRequest = { fn };
    if (args !== undefined) {
      request.args = args;
    }

    const response = invoke(request);

    if (!response.ok) {
      throw new Error(
        `eser-ajan WASM call "${fn}" failed: ${
          response.error ?? "unknown error"
        }`,
      );
    }

    return response.result ?? "";
  };

  return {
    symbols: {
      EserAjanVersion: () => call("version"),
      EserAjanInit: () => {
        call("init");
        return 0;
      },
      EserAjanShutdown: () => {
        call("shutdown");
      },
      EserAjanFree: (_ptr: unknown) => {
        // No-op in WASM mode — Go's GC handles memory.
      },
      EserAjanConfigLoad: (path: string) => call("configLoad", { path }),
      EserAjanDIResolve: (name: string) => call("diResolve", { name }),
    },
    close: () => {
      // No persistent resources to release in command mode.
    },
  };
};
