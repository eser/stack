// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun FFI backend using `bun:ffi`.
 *
 * This module is only functional when running under Bun 1.3+.
 * Under other runtimes, `available()` returns false and `open()` will throw.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * Bun FFI backend. Uses `dlopen` from `bun:ffi` to load C-shared libraries.
 *
 * Bun's `dlopen` takes a path and a symbol map where each symbol describes
 * its `args` (parameter types) and `returns` (return type). Pointer results
 * are read via `CString` from `bun:ffi`.
 */
export const backend: types.FFIBackend = {
  name: "bun",

  available: (): boolean => {
    // deno-lint-ignore no-explicit-any
    return typeof (globalThis as any).Bun !== "undefined";
  },

  open: async (libraryPath: string): Promise<types.FFILibrary> => {
    const bunFFI = await import("bun:ffi");
    const { dlopen, CString, ptr: ptrFn } = bunFFI;

    const lib = dlopen(libraryPath, {
      EserAjanVersion: {
        args: [],
        returns: "ptr",
      },
      EserAjanInit: {
        args: [],
        returns: "i32",
      },
      EserAjanShutdown: {
        args: [],
        returns: "void",
      },
      EserAjanFree: {
        args: ["ptr"],
        returns: "void",
      },
      EserAjanConfigLoad: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanDIResolve: {
        args: ["ptr"],
        returns: "ptr",
      },
    });

    const { symbols } = lib;

    /**
     * Encodes a JS string to a null-terminated Uint8Array and returns
     * a pointer suitable for passing to FFI calls.
     */
    const toCString = (str: string): unknown => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(str + "\0");
      return ptrFn(encoded);
    };

    /**
     * Reads a C string from a pointer and returns the JS string.
     */
    const readAndFree = (rawPtr: unknown): string => {
      if (rawPtr === null || rawPtr === 0) {
        return "";
      }
      const value = new CString(rawPtr);
      symbols.EserAjanFree(rawPtr);
      return value.toString();
    };

    return {
      symbols: {
        EserAjanVersion: (): string => {
          return readAndFree(symbols.EserAjanVersion());
        },
        EserAjanInit: (): number => {
          return symbols.EserAjanInit() as number;
        },
        EserAjanShutdown: (): void => {
          symbols.EserAjanShutdown();
        },
        EserAjanFree: (ptr: unknown): void => {
          symbols.EserAjanFree(ptr);
        },
        EserAjanConfigLoad: (path: string): string => {
          return readAndFree(symbols.EserAjanConfigLoad(toCString(path)));
        },
        EserAjanDIResolve: (name: string): string => {
          return readAndFree(symbols.EserAjanDIResolve(toCString(name)));
        },
      },
      close: (): void => {
        lib.close();
      },
    };
  },
};
