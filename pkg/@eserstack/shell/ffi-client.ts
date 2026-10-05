// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * This package's view of the Go bridge.
 *
 * The loader itself lives in `@eserstack/ajan/ffi/client` and is shared with
 * every other package, so the whole process opens the library once. This module
 * stays as the import path the package's own code already uses, and adds the
 * native-only handle that process spawning needs.
 */

import * as ffi from "@eserstack/ajan/ffi";

export {
  describeLoadFailure,
  ensureLib,
  getLib,
  getLoadError,
} from "@eserstack/ajan/ffi/client";

let nativeLoad: Promise<ffi.FFILibrary | null> | null = null;
let nativeLibrary: ffi.FFILibrary | null = null;
let nativeLoadError: Error | null = null;

/**
 * Loads the native bridge once per process, and resolves to `null` when it is
 * unavailable. Never rejects; the reason stays readable through
 * {@link describeNativeLoadFailure}.
 *
 * The shared client falls back to the WASM build, which loads and then fails
 * every command: Go's wasip1 target cannot start a process. A caller that
 * spawns processes would then surface that failure instead of using the runtime
 * spawn that works, so this asks for the native library only, the way
 * `@eserstack/ai` does for its bridge.
 */
export const ensureNativeLib = (): Promise<ffi.FFILibrary | null> => {
  if (nativeLoad === null) {
    nativeLoad = ffi.loadEserAjan({ wasm: false }).then(
      (loaded) => {
        nativeLibrary = loaded;
        return loaded;
      },
      (cause: unknown) => {
        nativeLoadError = cause instanceof Error
          ? cause
          : new Error(String(cause));
        return null;
      },
    );
  }

  return nativeLoad;
};

/**
 * The native bridge, or `null` when it is unavailable or
 * {@link ensureNativeLib} has not finished loading it.
 */
export const getNativeLib = (): ffi.FFILibrary | null => nativeLibrary;

/**
 * Why the native bridge is unavailable, as a line to append to an error
 * message, or "" when it loaded or was never asked to load.
 */
export const describeNativeLoadFailure = (): string =>
  nativeLoadError !== null ? `\nCause: ${nativeLoadError.message}` : "";
