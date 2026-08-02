// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as ffiTypes from "@eserstack/ajan/ffi";

// Eager FFI singleton — loaded at module import time, reused for every logging call.
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
        // Native library unavailable — requireLib() will throw for callers.
      });
  }

  return _libPromise;
};

export const getLib = (): ffiTypes.FFILibrary | null => _lib;

export const requireLib = (): ffiTypes.FFILibrary => {
  if (_lib === null) {
    throw new Error("FFI library unavailable — native binaries not loaded");
  }

  return _lib;
};

// Load at module init time so Deno's per-test sanitizer does not attribute
// the Deno.dlopen call to whichever test first triggers a log() call.
await ensureLib();
