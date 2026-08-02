// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as ffiTypes from "@eserstack/ajan/ffi";

// Lazy FFI singleton — loaded once per process, reused for every generate/sync call.
// If the native library is unavailable the promise resolves without setting _lib,
// and callers fall back to the pure TypeScript implementation.
let _lib: ffiTypes.FFILibrary | null = null;
let _libPromise: Promise<void> | null = null;

export const ensureLib = (): Promise<void> => {
  if (_libPromise === null) {
    _libPromise = import("@eserstack/ajan/ffi")
      .then((ffi) => ffi.loadEserAjan())
      .then((lib) => {
        _lib = lib;
      })
      .catch(() => {
        // Native library unavailable — callers use TS fallback.
      });
  }

  return _libPromise;
};

export const getLib = (): ffiTypes.FFILibrary | null => _lib;
