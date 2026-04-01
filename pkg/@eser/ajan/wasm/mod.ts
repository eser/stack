// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WASM entry point for the eser-ajan module.
 *
 * Provides a `loadEserAjanWasm()` function that loads the eser-ajan WASM module
 * and returns an FFILibrary-compatible interface. This is the fallback path
 * when native FFI is not available (e.g. in browsers or restricted runtimes).
 *
 * Usage:
 * ```ts
 * import * as wasm from "./wasm/mod.ts";
 *
 * const lib = await wasm.loadEserAjanWasm();
 * console.log(lib.symbols.EserAjanVersion());
 * lib.close();
 * ```
 *
 * @module
 */

export type { FFILibrary } from "../ffi/types.ts";

import type * as types from "../ffi/types.ts";
import * as resolve from "./resolve.ts";

/**
 * The directory containing this module — captured at import time via
 * `import.meta.dirname` so that `resolveWasmPath()` can locate the
 * WASM file relative to the source tree.
 */
const WASM_MODULE_DIR: string | undefined = import.meta.dirname;

/** Options for loading the WASM module. */
export interface LoadWasmOptions {
  /** WASM mode: "command" (JSON stdin/stdout) or "reactor" (direct exports). Default: "command". */
  mode?: "command" | "reactor";
  /** Explicit path to the .wasm file. When omitted, auto-resolved. */
  wasmPath?: string;
}

/**
 * Checks whether a WASM module can be found for the given mode.
 *
 * This is a non-throwing check — returns `false` if no WASM file is found
 * at any of the well-known locations.
 */
export const isWasmAvailable = (
  mode: "command" | "reactor" = "command",
): boolean => {
  try {
    resolve.resolveWasmPath(mode, WASM_MODULE_DIR);
    return true;
  } catch {
    return false;
  }
};

/**
 * Loads the eser-ajan WASM module and returns an FFILibrary-compatible interface.
 *
 * @param options - Optional configuration for mode and WASM file path.
 * @returns A promise that resolves to an FFILibrary handle.
 * @throws {Error} If the WASM file cannot be found or fails to load.
 */
export const loadEserAjanWasm = async (
  options?: LoadWasmOptions,
): Promise<types.FFILibrary> => {
  const mode = options?.mode ?? "command";
  const wasmPath = options?.wasmPath ??
    resolve.resolveWasmPath(mode, WASM_MODULE_DIR);

  if (mode === "reactor") {
    const { loadReactorWasm } = await import("./loader-reactor.ts");
    return loadReactorWasm(wasmPath);
  }

  const { loadCommandWasm } = await import("./loader-command.ts");
  return loadCommandWasm(wasmPath);
};
