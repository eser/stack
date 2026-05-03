// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
//
// ffi-client.template.ts — Canonical template for all @eserstack/* ffi-client.ts files.
//
// Usage:
//   Copy this file verbatim to pkg/@eserstack/<package>/ffi-client.ts.
//   Replace <PACKAGE> in the comment with the package name.
//   Do NOT add a `call<In,Out>()` wrapper — each call site marshals directly.
//   Do NOT call EserAjanFree — backends handle memory ownership internally.
//
// Invariants:
//   - _libPromise is set exactly once (prevents double-load races).
//   - catch() silently stays null — callers check getLib() !== null for FFI vs TS path.
//   - EserAjanFree is never called here; backends call it after copying the C string.

import type * as ffiTypes from "@eserstack/ajan/ffi";

// Lazy FFI singleton — loaded once per process, reused for every <PACKAGE> call.
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
