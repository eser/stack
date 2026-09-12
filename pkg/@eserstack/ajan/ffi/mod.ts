// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Unified FFI entry point for the eser-ajan C-shared library.
 *
 * Provides a single `loadEserAjan()` function that abstracts away the
 * differences between Deno (`Deno.dlopen`), Bun (`bun:ffi`), and
 * Node.js (`node:ffi`) FFI APIs. Falls back to WASM when no native FFI
 * backend is available.
 *
 * ## Feature Flags
 *
 * Environment variables control which backends are enabled for incremental
 * rollout. Set any of these to `"disabled"` to skip the corresponding backend:
 *
 * - `ESER_AJAN=disabled` — disable everything; `loadEserAjan()` throws immediately
 * - `ESER_AJAN_NATIVE=disabled` — disable native FFI; skip straight to WASM fallback
 * - `ESER_AJAN_WASM=disabled` — disable WASM fallback; only try native
 *
 * Usage:
 * ```ts
 * import * as ffi from "./ffi/mod.ts";
 *
 * const lib = await ffi.loadEserAjan();
 * lib.symbols.EserAjanInit();
 * console.log(lib.symbols.EserAjanVersion());
 * lib.symbols.EserAjanShutdown();
 * lib.close();
 * ```
 *
 * Programmatic control:
 * ```ts
 * const lib = await ffi.loadEserAjan({ native: false }); // skip native, use WASM
 * const lib = await ffi.loadEserAjan({ backends: ["deno"] }); // only try Deno
 * ```
 *
 * @module
 */

export type {
  FFIBackend,
  FFILibrary,
  LibraryExtension,
  RuntimeId,
} from "./types.ts";

import * as backendDeno from "./backend-deno.ts";
import * as backendBun from "./backend-bun.ts";
import * as backendNode from "./backend-node.ts";
import * as resolve from "./resolve.ts";
import type * as types from "./types.ts";

// ---------------------------------------------------------------------------
// Feature flag helpers
// ---------------------------------------------------------------------------

/**
 * Options for programmatic control of backend selection.
 * Environment variables take precedence — if an env var disables a backend,
 * it stays disabled even if `LoadOptions` would enable it.
 */
export interface LoadOptions {
  /** Allow native FFI backends. Default: `true` (unless `ESER_AJAN_NATIVE=disabled`). */
  native?: boolean;
  /** Allow WASM fallback. Default: `true` (unless `ESER_AJAN_WASM=disabled`). */
  wasm?: boolean;
  /**
   * Restrict native backend selection to these runtimes, tried in the order
   * given here rather than the built-in priority order. Unknown ids are
   * ignored. Default: every registered backend, in priority order.
   */
  backends?: readonly types.RuntimeId[];
}

/**
 * Reads an environment variable in a runtime-agnostic way.
 * Uses `process.env` which works on Deno 2.7+, Node.js, and Bun.
 */
const getEnv = (name: string): string | undefined => {
  try {
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any;

    // process.env works on Deno 2.7+, Node.js, and Bun
    if (typeof g.process !== "undefined" && g.process.env != null) {
      return g.process.env[name] as string | undefined;
    }
  } catch {
    // Permission denied or similar — treat as unset
  }

  return undefined;
};

/** Returns `true` when the given env var is set to `"disabled"` (case-insensitive). */
const isDisabledByEnv = (envVar: string): boolean => {
  const value = getEnv(envVar);
  return value !== undefined && value.toLowerCase() === "disabled";
};

/**
 * Emit a diagnostic about FFI backend selection.
 *
 * Off unless ESER_AJAN_DEBUG is set, and on stderr when it is. It used to call
 * console.debug unconditionally, which Deno writes to STDOUT -- so every single
 * CLI invocation printed "[eser-ajan/ffi] WASM fallback disabled" into its own
 * output. That is not merely noise: `eser . commitmsg` documents piping its
 * result to pbcopy, and the line went into the clipboard along with the commit
 * message.
 *
 * Diagnostics belong on stderr regardless of the flag, so that a caller
 * enabling them can still pipe stdout.
 */
const debugLog = (message: string): void => {
  if (getEnv("ESER_AJAN_DEBUG") === undefined) {
    return;
  }

  // deno-lint-ignore no-console
  console.error(`[eser-ajan/ffi] ${message}`);
};

/** Message text of an arbitrary thrown value, for embedding in diagnostics. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// ---------------------------------------------------------------------------
// Core module
// ---------------------------------------------------------------------------

/**
 * The directory containing this module — captured at import time via
 * `import.meta.dirname` so that `resolveLibraryPath()` can locate the
 * shared library relative to the source tree.
 */
const FFI_MODULE_DIR: string | undefined = import.meta.dirname;

/** Re-export resolution utilities. */
export const getLibraryExtension = resolve.getLibraryExtension;

/**
 * Resolves the path to the eser-ajan shared library.
 * Delegates to `resolve.resolveLibraryPath()` with the module directory hint.
 */
export const resolveLibraryPath = (moduleDirHint?: string): string =>
  resolve.resolveLibraryPath(moduleDirHint ?? FFI_MODULE_DIR);

/** All registered backends in priority order. */
const BACKENDS: readonly types.FFIBackend[] = [
  backendDeno.backend,
  backendBun.backend,
  backendNode.backend,
];

/**
 * Detects the current JavaScript runtime.
 */
export const detectRuntime = (): types.RuntimeId => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  if (typeof g.Deno !== "undefined" && typeof g.Deno.dlopen === "function") {
    return "deno";
  }
  if (typeof g.Bun !== "undefined") {
    return "bun";
  }
  if (
    typeof g.process !== "undefined" &&
    typeof g.process.versions?.node === "string" &&
    typeof g.Deno === "undefined" &&
    typeof g.Bun === "undefined"
  ) {
    return "node";
  }

  return "unknown";
};

/**
 * Selects the first registered native FFI backend that reports itself as
 * available in the current runtime.
 *
 * Feature-flag env vars are not read here — `loadEserAjan()` resolves those
 * before deciding whether to call this at all.
 *
 * @param options - Optional `backends` allow-list; see `LoadOptions.backends`.
 * @throws {Error} If none of the candidate backends is available.
 */
export const selectBackend = (
  options?: Pick<LoadOptions, "backends">,
): types.FFIBackend => {
  const requested = options?.backends;
  const candidates: readonly types.FFIBackend[] = requested === undefined
    ? BACKENDS
    : requested.flatMap((id) => BACKENDS.filter((entry) => entry.name === id));

  for (const backend of candidates) {
    if (!backend.available()) {
      continue;
    }

    return backend;
  }

  const runtime = detectRuntime();

  throw new Error(
    `No FFI backend available for runtime "${runtime}".\n` +
      `Supported runtimes:\n` +
      `  - Deno 2.7+ (Deno.dlopen)\n` +
      `  - Bun 1.3+  (bun:ffi)\n` +
      `  - Node 25+  (node:ffi, experimental)\n` +
      `\nCurrent runtime: ${runtime}` +
      (requested === undefined
        ? ``
        : `\nRestricted to backends: ${requested.join(", ")}`),
  );
};

/**
 * Performs one real open: resolve, select a backend, dlopen, or fall back to
 * WASM. Every call reaches the runtime, so callers go through
 * {@link loadEserAjan}, which shares the result.
 */
const openEserAjan = async (
  libraryPathOrOptions?: string | LoadOptions,
  options?: LoadOptions,
): Promise<types.FFILibrary> => {
  // Resolve overloaded arguments
  const libraryPath: string | undefined =
    typeof libraryPathOrOptions === "string" ? libraryPathOrOptions : undefined;
  const opts: LoadOptions | undefined = typeof libraryPathOrOptions === "object"
    ? libraryPathOrOptions
    : options;

  // --- Global kill switch ---
  if (isDisabledByEnv("ESER_AJAN")) {
    debugLog("ALL disabled — ESER_AJAN=disabled");
    throw new Error(
      "Ajan is disabled via ESER_AJAN=disabled environment variable.\n" +
        "Unset ESER_AJAN to re-enable.",
    );
  }

  // --- Determine what's allowed ---
  const nativeAllowed = !isDisabledByEnv("ESER_AJAN_NATIVE") &&
    (opts?.native !== false);
  const wasmAllowed = !isDisabledByEnv("ESER_AJAN_WASM") &&
    (opts?.wasm !== false);

  // Say WHICH of the two causes applied. "disabled" alone reads like a global
  // capability being switched off, when the usual cause is a single caller
  // declining a fallback that cannot serve it -- @eserstack/ai passes
  // `wasm: false` because WASM loads and then fails every request (Go's wasip1
  // target has no outbound network), and a provider that is present and broken
  // is worse than one that is absent.
  if (!nativeAllowed) {
    debugLog(
      isDisabledByEnv("ESER_AJAN_NATIVE")
        ? "native disabled by ESER_AJAN_NATIVE — trying WASM fallback"
        : "native not requested by caller — trying WASM fallback",
    );
  }

  if (!wasmAllowed) {
    debugLog(
      isDisabledByEnv("ESER_AJAN_WASM")
        ? "WASM fallback disabled by ESER_AJAN_WASM"
        : "WASM fallback not offered by caller (native only)",
    );
  }

  // --- Try native FFI ---
  // Kept for the failure paths below: whichever of resolveLibraryPath,
  // selectBackend or dlopen failed is the only description of WHY native is
  // unavailable, and every later throw has to carry it or it is lost for good.
  let nativeError: unknown;

  if (nativeAllowed) {
    try {
      const resolvedPath = libraryPath ??
        resolve.resolveLibraryPath(FFI_MODULE_DIR);
      const backend = selectBackend(opts);
      return await backend.open(resolvedPath);
    } catch (error) {
      nativeError = error;
      debugLog(`native FFI failed: ${errorMessage(error)}`);

      // An explicit path is an assertion that this exact file is the library to
      // use. Answering with WASM instead would serve a different implementation
      // than the caller named, so the failure is theirs to see.
      if (libraryPath !== undefined) {
        throw error;
      }
    }
  }

  // --- Fall back to WASM ---
  if (wasmAllowed) {
    try {
      const wasmMod = await import("../wasm/mod.ts");
      return await wasmMod.loadEserAjanWasm();
    } catch (wasmErr) {
      throw new Error(
        `No native FFI backend available and WASM fallback failed.\n` +
          `Native error: ${
            nativeError === undefined
              ? "native FFI not attempted"
              : errorMessage(nativeError)
          }\n` +
          `WASM error: ${errorMessage(wasmErr)}\n\n` +
          `To fix this, install the @eserstack/ajan package or build the native library.\n` +
          `  See: https://github.com/eser/stack/tree/main/pkg/@eserstack/ajan`,
        // The native failure is the root cause whenever there was one; the WASM
        // failure is only the fallback declining to paper over it.
        { cause: nativeError ?? wasmErr },
      );
    }
  }

  // --- Neither native nor WASM allowed ---
  const reasons: string[] = [];
  if (!nativeAllowed) {
    reasons.push(
      isDisabledByEnv("ESER_AJAN_NATIVE")
        ? "ESER_AJAN_NATIVE=disabled"
        : "native=false in LoadOptions",
    );
  }
  if (!wasmAllowed) {
    reasons.push(
      isDisabledByEnv("ESER_AJAN_WASM")
        ? "ESER_AJAN_WASM=disabled"
        : "wasm=false in LoadOptions",
    );
  }

  // Native ran and failed, and the caller declined the fallback that would have
  // hidden it -- @eserstack/ai is the standing example. "All backends are
  // disabled" would name the caller's own `wasm: false` as the fault and drop
  // the one diagnostic that explains the failure.
  if (nativeError !== undefined) {
    throw new Error(
      `Native FFI failed and no fallback is available.\n` +
        `Native error: ${errorMessage(nativeError)}\n` +
        `Fallback unavailable: ${reasons.join(", ")}\n\n` +
        `To fix this, install the @eserstack/ajan package or build the native library.\n` +
        `  See: https://github.com/eser/stack/tree/main/pkg/@eserstack/ajan`,
      { cause: nativeError },
    );
  }

  throw new Error(
    `All FFI backends are disabled.\n` +
      `Reasons: ${reasons.join(", ")}\n\n` +
      `To fix this, unset the relevant environment variables or adjust LoadOptions.`,
  );
};

// ---------------------------------------------------------------------------
// Shared handles
// ---------------------------------------------------------------------------

/** A live shared open, plus how many callers still hold it. */
interface CacheEntry {
  library: Promise<types.FFILibrary>;
  refs: number;
}

/**
 * One entry per distinct request. Keyed on the arguments rather than on the
 * resolved path because the options change what a handle *is*: `wasm: false`
 * must not be served a WASM handle that an earlier permissive caller cached.
 */
const openLibraries = new Map<string, CacheEntry>();

const cacheKey = (
  libraryPath: string | undefined,
  options: LoadOptions | undefined,
): string =>
  JSON.stringify({
    path: libraryPath ?? null,
    native: options?.native ?? null,
    wasm: options?.wasm ?? null,
    backends: options?.backends ?? null,
  });

/**
 * Opens the eser-ajan shared library using the best available FFI backend,
 * falling back to WASM when no native backend or library is found.
 *
 * Callers asking for the same thing share one open. Roughly twenty packages in
 * this repo each used to hold their own loader singleton, so a process touching
 * logging, shell, formats and codebase paid four `Deno.dlopen` calls for one
 * file; they now share one handle.
 *
 * Sharing makes `close()` a cross-package action, so handles are reference
 * counted: every call hands back a wrapper whose `close()` is idempotent for
 * that caller and releases one reference. The library is really closed, and the
 * entry dropped, only when the last holder closes. A caller that closes while
 * others are still using it therefore cannot pull the library out from under
 * them.
 *
 * A failed open is NOT cached. The usual causes are environmental -- the native
 * library has not been built yet, or a permission was not granted -- and those
 * change within a process's lifetime, so a later attempt is allowed to succeed.
 *
 * When `libraryPath` is omitted the library is resolved automatically and a
 * native failure degrades to WASM. When it is given, a native failure is
 * rethrown untouched: the caller named a specific file, so answering with a
 * different implementation would be wrong.
 *
 * @param libraryPathOrOptions - Optional explicit path **or** a `LoadOptions` object.
 * @param options - Optional `LoadOptions` when a library path is also provided.
 * @returns A promise that resolves to a unified FFI library handle.
 * @throws {Error} If neither native FFI nor WASM fallback is available. Errors
 *   raised after a native attempt carry that attempt's error as `cause`.
 */
export const loadEserAjan = async (
  libraryPathOrOptions?: string | LoadOptions,
  options?: LoadOptions,
): Promise<types.FFILibrary> => {
  const libraryPath: string | undefined =
    typeof libraryPathOrOptions === "string" ? libraryPathOrOptions : undefined;
  const opts: LoadOptions | undefined = typeof libraryPathOrOptions === "object"
    ? libraryPathOrOptions
    : options;

  const key = cacheKey(libraryPath, opts);
  let entry = openLibraries.get(key);

  if (entry === undefined) {
    entry = {
      library: openEserAjan(libraryPathOrOptions, options),
      refs: 0,
    };
    openLibraries.set(key, entry);

    // Drop the entry on failure so the next caller retries rather than
    // inheriting a rejection that described a since-fixed environment. The
    // catch is attached before any await so a rejection cannot go unhandled.
    entry.library.catch(() => {
      if (openLibraries.get(key) === entry) {
        openLibraries.delete(key);
      }
    });
  }

  entry.refs += 1;

  const library = await entry.library;
  let released = false;

  return {
    symbols: library.symbols,
    close: (): void => {
      if (released) {
        return;
      }

      released = true;

      const current = openLibraries.get(key);
      if (current !== entry) {
        return;
      }

      entry.refs -= 1;
      if (entry.refs > 0) {
        return;
      }

      openLibraries.delete(key);
      library.close();
    },
  };
};
