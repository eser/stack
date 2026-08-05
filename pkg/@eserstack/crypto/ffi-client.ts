// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as ffiTypes from "@eserstack/ajan/ffi";

// Lazy FFI singleton — one per isolate, reused for every crypto call.
// `deno test` gives each test file a fresh isolate, so this is NOT once per
// process. The native image pins itself at load time so repeated dlopen/
// dlclose cycles cannot restart the Go runtime; see
// pkg/@eserstack/ajan/pin_image_posix.go.
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
        // Native library unavailable — callers use Web Crypto fallback.
      });
  }

  return _libPromise;
};

export const getLib = (): ffiTypes.FFILibrary | null => _lib;
