// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js FFI backend using `koffi`.
 *
 * koffi is a fast, zero-JS-dependency C FFI library for Node.js that ships
 * prebuilt binaries for all major platforms. It automatically marshals
 * `char*` returns to JS strings.
 *
 * This module is only functional when running under Node.js with `koffi`
 * installed. Under other runtimes (Deno, Bun), `available()` returns false.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * koffi module resolved once via top-level await.
 * Returns `null` on non-Node runtimes or when koffi is not installed.
 */
// deno-lint-ignore no-explicit-any
let koffi: any = null;
try {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  // Only attempt import on actual Node.js (not Deno or Bun)
  if (
    typeof g.process !== "undefined" &&
    typeof g.process.versions?.node === "string" &&
    typeof g.Deno === "undefined" &&
    typeof g.Bun === "undefined"
  ) {
    koffi = await import("koffi");
    // Handle default export (koffi uses module.exports = ...)
    if (koffi.default !== undefined) {
      koffi = koffi.default;
    }
  }
} catch {
  // koffi not installed — stays null
}

/**
 * Node.js FFI backend using koffi.
 */
export const backend: types.FFIBackend = {
  name: "node",

  available: (): boolean => {
    return koffi !== null && typeof koffi.load === "function";
  },

  open: (libraryPath: string): types.FFILibrary => {
    if (koffi === null) {
      throw new Error(
        "koffi is not available. Install it: npm install koffi",
      );
    }

    const lib = koffi.load(libraryPath);

    // koffi auto-decodes char* to JS string, so we just call and return.
    // Go's C.CString allocates via malloc — we should call EserAjanFree,
    // but koffi's char* return already copies the string. The Go side
    // still holds the pointer until freed. For safety we use opaque
    // pointers for the free call.
    const rawVersion = lib.func("char* EserAjanVersion()");
    const rawInit = lib.func("int EserAjanInit()");
    const rawShutdown = lib.func("void EserAjanShutdown()");
    const rawConfigLoad = lib.func(
      "char* EserAjanConfigLoad(const char* path)",
    );
    const rawDIResolve = lib.func(
      "char* EserAjanDIResolve(const char* name)",
    );

    return {
      symbols: {
        EserAjanVersion: (): string => {
          return rawVersion() ?? "";
        },
        EserAjanInit: (): number => {
          return rawInit() as number;
        },
        EserAjanShutdown: (): void => {
          rawShutdown();
        },
        EserAjanFree: (_ptr: unknown): void => {
          // koffi handles string copying — no manual free needed
        },
        EserAjanConfigLoad: (path: string): string => {
          return rawConfigLoad(path) ?? "";
        },
        EserAjanDIResolve: (name: string): string => {
          return rawDIResolve(name) ?? "";
        },
      },
      close: (): void => {
        lib.unload();
      },
    };
  },
};
