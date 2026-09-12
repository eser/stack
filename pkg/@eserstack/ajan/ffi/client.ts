// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The shared FFI client every consumer package loads the bridge through.
 *
 * Around twenty packages each kept their own copy of this: a module-scoped
 * `_lib`/`_libPromise` pair, an `ensureLib` ending in `.catch(() => {})`, and a
 * `getLib`. Three of them carried two copies, in the same package, both
 * reachable from its public `mod.ts`. Since `loadEserAjan` was not memoized,
 * every copy meant another `Deno.dlopen` of the same file, and every
 * `.catch(() => {})` discarded the one string that explains why the bridge is
 * missing -- the checked-paths list, the permission error, the native-vs-WASM
 * cause.
 *
 * This module keeps the useful half of that shape and drops the rest: loading
 * stays lazy and non-throwing, so callers with a TypeScript fallback can ask
 * for `getLib()` and get `null`, but the failure is retained and readable
 * through {@link getLoadError} instead of being swallowed.
 *
 * @module
 */

import type * as types from "./types.ts";
import { loadEserAjan } from "./mod.ts";

let library: types.FFILibrary | null = null;
let loadPromise: Promise<void> | null = null;
let loadError: Error | null = null;

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * Loads the bridge once per process, and never rejects.
 *
 * Callers that can degrade check {@link getLib} for `null`; callers that cannot
 * use {@link requireLib}. Either way the reason for a failure stays available
 * through {@link getLoadError}.
 */
export const ensureLib = (): Promise<void> => {
  if (loadPromise === null) {
    loadPromise = loadEserAjan()
      .then((loaded) => {
        library = loaded;
        loadError = null;
      })
      .catch((cause: unknown) => {
        loadError = asError(cause);
      });
  }

  return loadPromise;
};

/** The loaded bridge, or `null` when it is unavailable or not yet loaded. */
export const getLib = (): types.FFILibrary | null => library;

/**
 * Why the bridge is unavailable, or `null` when it loaded or has not been
 * tried. Worth surfacing wherever a package tells the user it fell back to a
 * TypeScript implementation: "native library unavailable" on its own leaves
 * nobody able to act.
 */
export const getLoadError = (): Error | null => loadError;

/**
 * The loaded bridge, loading it first if needed.
 *
 * @throws {Error} When the bridge is unavailable, carrying the underlying load
 *   failure as `cause`.
 */
export const requireLib = async (): Promise<types.FFILibrary> => {
  await ensureLib();

  return requireLibSync();
};

/**
 * The loaded bridge, without awaiting.
 *
 * For call sites that cannot be async -- the logging hot path is the standing
 * example. `ensureLib()` must already have settled; this never triggers a load,
 * because doing so silently would hand back a `null` that looks like "no native
 * library" when it only means "not finished loading".
 *
 * @throws {Error} When the bridge is unavailable or loading has not completed.
 */
/** How a {@link callJson} caller turns the two failure modes into its own errors. */
export interface CallJsonOptions {
  /** Built when the bridge could not be loaded at all. */
  readonly onUnavailable: () => Error;
  /** Built from the `error` field the Go side returned. */
  readonly onError: (message: string) => Error;
}

/**
 * Runs one bridge call and unwraps its JSON envelope.
 *
 * Every bridge call site repeated the same ten lines: ensure the library,
 * null-check it, stringify a request, invoke a symbol, parse the reply, test an
 * `error` field, throw or return. The two genuinely per-package parts are the
 * error TYPES -- each package throws its own, with its own code mapping -- so
 * they are injected rather than flattened into one generic error, which is what
 * made earlier attempts at this helper not fit.
 *
 * `invoke` receives the loaded library and returns the raw reply. Awaiting it
 * covers both the synchronous symbols and the nine Deno marks `nonblocking`,
 * which return a promise.
 */
export const callJson = async <TResponse>(
  invoke: (lib: types.FFILibrary) => string | Promise<string>,
  options: CallJsonOptions,
): Promise<TResponse> => {
  await ensureLib();

  const lib = getLib();

  if (lib === null) {
    throw options.onUnavailable();
  }

  const raw = await invoke(lib);
  const parsed = JSON.parse(raw) as TResponse & { error?: unknown };

  // Only a non-empty string counts: the bridge omits the field on success, and
  // some responses legitimately carry an `error` key holding null.
  if (typeof parsed.error === "string" && parsed.error.length > 0) {
    throw options.onError(parsed.error);
  }

  return parsed;
};

export const requireLibSync = (): types.FFILibrary => {
  if (library !== null) {
    return library;
  }

  if (loadError !== null) {
    throw new Error(
      `eser-ajan native library unavailable: ${loadError.message}`,
      { cause: loadError },
    );
  }

  throw new Error(
    "eser-ajan native library has not finished loading. " +
      "Await ensureLib() before calling requireLibSync().",
  );
};
