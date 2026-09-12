// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Closed-state guard shared by the three native FFI backends.
 *
 * Each backend owns a runtime handle -- `Deno.dlopen`, `bun:ffi`'s `dlopen`,
 * `koffi.load` -- whose unload is not safe to repeat and whose symbols are not
 * safe to call once it has run. Deno throws `BadResource`, and unloading a Go
 * c-shared image is undefined behaviour: a Go runtime cannot be dlclosed, which
 * is why pin_image_posix.go pins the image in the first place. This module
 * turns both into defined behaviour, identically for every backend.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * A bridge symbol as seen while wrapping. The real signatures are on
 * {@link types.FFILibrary}; this shape only exists so the table can be walked
 * generically.
 */
// deno-lint-ignore no-explicit-any
type RawSymbol = (...args: any[]) => any;

/**
 * Wraps a backend's symbol table and library unload in a closed-state guard.
 *
 * `close()` is idempotent -- the second and later calls are no-ops instead of
 * runtime errors -- and any symbol called after it throws an Error naming the
 * symbol rather than segfaulting inside a library that is no longer there.
 *
 * Two things stay the caller's contract and are deliberately not enforced here:
 * - `close()` does not call `EserAjanShutdown`. Shutting the Go runtime down and
 *   releasing the library handle are separate steps, in that order.
 * - On Deno the nonblocking symbols may still be executing on the FFI
 *   threadpool when `close()` runs. Callers must settle every outstanding
 *   promise and close every stream handle first; in-flight calls are not
 *   tracked.
 *
 * @param backendName Backend identity used in the after-close error message.
 * @param symbols The backend's fully wrapped symbol table.
 * @param closeLibrary Runtime-specific unload; invoked at most once.
 * @returns The library handle to hand back to callers.
 */
export const withCloseGuard = (
  backendName: string,
  symbols: types.FFILibrary["symbols"],
  closeLibrary: () => void,
): types.FFILibrary => {
  let closed = false;

  const assertOpen = (symbolName: string): void => {
    if (closed) {
      throw new Error(
        `${symbolName}: the ${backendName} FFI library is already closed. ` +
          "Open a new handle before calling any symbol again.",
      );
    }
  };

  // Arity is part of the ABI contract, so each wrapper redeclares the parameter
  // count of the symbol it fronts instead of collapsing to a rest parameter.
  const guard = (symbolName: string, symbol: RawSymbol): RawSymbol => {
    if (symbol.length === 0) {
      return (): unknown => {
        assertOpen(symbolName);
        return symbol();
      };
    }

    if (symbol.length === 1) {
      return (a: unknown): unknown => {
        assertOpen(symbolName);
        return symbol(a);
      };
    }

    return (a: unknown, b: unknown): unknown => {
      assertOpen(symbolName);
      return symbol(a, b);
    };
  };

  const guarded: Record<string, RawSymbol> = {};
  const entries = Object.entries(symbols) as Array<[string, RawSymbol]>;

  for (const [symbolName, symbol] of entries) {
    guarded[symbolName] = guard(symbolName, symbol);
  }

  return {
    symbols: guarded as types.FFILibrary["symbols"],
    close: (): void => {
      if (closed) {
        return;
      }

      closed = true;
      closeLibrary();
    },
  };
};
