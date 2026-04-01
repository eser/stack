// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno FFI backend using `Deno.dlopen()`.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * Symbol definitions for `Deno.dlopen`.
 *
 * Each key matches a C export from main.go. The Go side uses `*C.char` for
 * strings and `C.int` for integers, which map to Deno's `"pointer"` and
 * `"i32"` respectively.
 */
const SYMBOL_DEFINITIONS = {
  EserAjanVersion: {
    parameters: [],
    result: "pointer",
  },
  EserAjanInit: {
    parameters: [],
    result: "i32",
  },
  EserAjanShutdown: {
    parameters: [],
    result: "void",
  },
  EserAjanFree: {
    parameters: ["pointer"],
    result: "void",
  },
  EserAjanConfigLoad: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanDIResolve: {
    parameters: ["pointer"],
    result: "pointer",
  },
} as const;

/**
 * Encodes a JS string into a null-terminated C string buffer backed by an
 * `ArrayBuffer` (required by `Deno.UnsafePointer.of`).
 */
const toCString = (str: string): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const ab = new ArrayBuffer(encoded.length + 1);
  const buf = new Uint8Array(ab);
  buf.set(encoded);
  // Last byte is already 0 (null terminator)
  return buf;
};

/**
 * Reads a C string from a pointer. Returns the JS string and the raw pointer
 * so the caller can free it.
 */
const readCString = (
  ptr: Deno.PointerValue,
): { value: string; ptr: Deno.PointerValue } => {
  if (ptr === null) {
    return { value: "", ptr };
  }
  const value = new Deno.UnsafePointerView(ptr).getCString();
  return { value, ptr };
};

/**
 * Creates a high-level symbol wrapper that automatically handles
 * string↔pointer conversions and frees returned C strings.
 */
const createSymbolWrappers = (
  // deno-lint-ignore no-explicit-any
  rawSymbols: any,
): types.FFILibrary["symbols"] => {
  const freePtr = (ptr: Deno.PointerValue): void => {
    if (ptr !== null) {
      rawSymbols.EserAjanFree(ptr);
    }
  };

  return {
    EserAjanVersion: (): string => {
      const { value, ptr } = readCString(rawSymbols.EserAjanVersion());
      freePtr(ptr);
      return value;
    },
    EserAjanInit: (): number => {
      return rawSymbols.EserAjanInit() as number;
    },
    EserAjanShutdown: (): void => {
      rawSymbols.EserAjanShutdown();
    },
    EserAjanFree: (ptr: unknown): void => {
      rawSymbols.EserAjanFree(ptr as Deno.PointerValue);
    },
    EserAjanConfigLoad: (path: string): string => {
      const cPath = toCString(path);
      const rawPtr = rawSymbols.EserAjanConfigLoad(
        Deno.UnsafePointer.of(cPath),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanDIResolve: (name: string): string => {
      const cName = toCString(name);
      const rawPtr = rawSymbols.EserAjanDIResolve(
        Deno.UnsafePointer.of(cName),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
  };
};

/**
 * Deno FFI backend. Uses `Deno.dlopen()` to load C-shared libraries.
 */
export const backend: types.FFIBackend = {
  name: "deno",

  available: (): boolean => {
    return typeof Deno !== "undefined" && typeof Deno.dlopen === "function";
  },

  open: (libraryPath: string): types.FFILibrary => {
    const lib = Deno.dlopen(libraryPath, SYMBOL_DEFINITIONS);

    return {
      symbols: createSymbolWrappers(lib.symbols),
      close: (): void => {
        lib.close();
      },
    };
  },
};
