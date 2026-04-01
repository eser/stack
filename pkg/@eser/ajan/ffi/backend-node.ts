// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js FFI backend using `node:ffi` (experimental, Node 25+).
 *
 * The `node:ffi` module mirrors Deno's `dlopen` API closely:
 * - `dlopen(path, symbolDefinitions)` returns `{ symbols, close() }`
 * - Pointer values are read via `getNullTerminatedString(ptr)` from `node:ffi`
 *
 * This module is only functional when running under Node.js 25+ with the
 * `node:ffi` module available. Under other runtimes, `available()` returns
 * false.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * `node:ffi` module resolved once via top-level await.
 * Returns `null` on non-Node runtimes or older Node versions without FFI.
 */
// deno-lint-ignore no-explicit-any
let nodeFFI: any = null;
try {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  // Only attempt import on actual Node.js (not Deno or Bun which also
  // expose process.versions.node)
  if (
    typeof g.process !== "undefined" &&
    typeof g.process.versions?.node === "string" &&
    typeof g.Deno === "undefined" &&
    typeof g.Bun === "undefined"
  ) {
    nodeFFI = await import("node:ffi");
  }
} catch {
  // node:ffi not available — nodeFFI stays null
}

/**
 * Node.js FFI backend. Uses `node:ffi` (experimental) to load C-shared
 * libraries.
 */
export const backend: types.FFIBackend = {
  name: "node",

  available: (): boolean => {
    return nodeFFI !== null;
  },

  open: (libraryPath: string): types.FFILibrary => {
    if (nodeFFI === null) {
      throw new Error(
        "node:ffi is not available. Node.js 25+ with --experimental-ffi is required.",
      );
    }

    const { dlopen, getNullTerminatedString } = nodeFFI;

    // node:ffi uses the same symbol definition format as Deno.dlopen
    const symbolDefinitions = {
      EserAjanVersion: {
        parameters: [] as string[],
        result: "pointer",
      },
      EserAjanInit: {
        parameters: [] as string[],
        result: "i32",
      },
      EserAjanShutdown: {
        parameters: [] as string[],
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
    };

    const lib = dlopen(libraryPath, symbolDefinitions);
    const { symbols } = lib;

    /**
     * Encodes a JS string into a null-terminated buffer for passing
     * as a C string pointer.
     */
    const toCString = (str: string): Uint8Array => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(str);
      const buf = new Uint8Array(encoded.length + 1);
      buf.set(encoded);
      return buf;
    };

    /**
     * Reads a null-terminated C string from a pointer, frees it, and
     * returns the JS string.
     */
    const readAndFree = (ptr: unknown): string => {
      if (ptr === null || ptr === undefined) {
        return "";
      }
      const value = getNullTerminatedString(ptr);
      symbols.EserAjanFree(ptr);
      return value;
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
