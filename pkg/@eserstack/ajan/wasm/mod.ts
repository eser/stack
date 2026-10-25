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
 * The module is the slim "wasi" profile, built as a reactor and reused for
 * every call, so the handle-based APIs it serves (parsing and codebase
 * streams, caches) keep their handles between calls. Names outside the
 * profile, such as the AI, HTTP, logging and shell functions, throw
 * `UnsupportedInWasmError`; those need the native library.
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

export {
  REACTOR_ABI_VERSION,
  UnsupportedInWasmError,
} from "./loader-reactor.ts";

/** Options for loading the WASM module. */
export interface LoadWasmOptions {
  /** Explicit path to the .wasm file. When omitted, auto-resolved. */
  wasmPath?: string;
}

/**
 * Checks whether the WASM module can be found.
 *
 * This is a non-throwing check — returns `false` if no WASM file is found
 * at any of the well-known locations.
 */
export const isWasmAvailable = (): boolean => {
  try {
    resolve.resolveWasmPath(WASM_MODULE_DIR);
    return true;
  } catch {
    return false;
  }
};

/**
 * Loads the eser-ajan WASM module and returns an FFILibrary-compatible interface.
 *
 * @param options - Optional configuration for the WASM file path.
 * @returns A promise that resolves to an FFILibrary handle.
 * @throws {Error} If the WASM file cannot be found or fails to load.
 */
export const loadEserAjanWasm = async (
  options?: LoadWasmOptions,
): Promise<types.FFILibrary> => {
  const wasmPath =
    options?.wasmPath ?? resolve.resolveWasmPath(WASM_MODULE_DIR);
  const { loadReactorWasm } = await import("./loader-reactor.ts");

  return await loadReactorWasm(wasmPath);
};
