// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry point for the eser-ajan C-shared library on Node.
 *
 * `loadEserAjan()` has one loader order (decision-37): the native library
 * through the built-in `node:ffi` module first; if that cannot load, the WASM
 * build (the wasi-profile reactor, decision-45); if that fails too, an error
 * that names both causes.
 *
 * ## Feature Flags
 *
 * Environment variables switch the two steps off. Set any of these to
 * `"disabled"`:
 *
 * - `ESER_AJAN=disabled`: disable everything; `loadEserAjan()` throws immediately
 * - `ESER_AJAN_NATIVE=disabled`: skip node:ffi and go straight to the WASM build
 * - `ESER_AJAN_WASM=disabled`: disable the WASM fallback; only try node:ffi
 *
 * Usage:
 * ```ts
 * import * as ffi from "./ffi/mod.ts";
 *
 * const lib = await ffi.loadEserAjan();
 * console.log(lib.handshake.version, lib.backend);
 * const answer = lib.call("formatEncode", { format: "yaml", data: { a: 1 } });
 * const walk = lib.stream("codebaseWalkFilesStream", { dir: "." });
 * for (let file = walk.read(); file !== null; file = walk.read()) {
 *   console.log(file.path);
 * }
 * walk.close();
 * lib.close();
 * ```
 *
 * Every name, its kind and its request and answer types are in the binding
 * table (`bindings.ts`).
 *
 * Programmatic control:
 * ```ts
 * const wasmOnly = await ffi.loadEserAjan({ native: false });
 * const nativeOnly = await ffi.loadEserAjan({ wasm: false });
 * ```
 *
 * @module
 */

export type {
  AjanStream,
  Backend,
  Envelope,
  FFILibrary,
  Handshake,
  LibraryExtension,
} from "./types.ts";
export {
  AbiMismatchError,
  AjanCallError,
  UnknownFunctionError,
  UnsupportedInWasmError,
} from "./errors.ts";
export { ABI_VERSION } from "./library.ts";
export { BINDINGS, bindingOf } from "./bindings.ts";
export type {
  AiAnswer,
  BindingName,
  BindingSpec,
  Bindings,
  BridgeAnswer,
  BridgeRequest,
  CallBinding,
  CallName,
  CallResult,
  ChunkOf,
  ClosedOf,
  EmptyAnswer,
  ErrorAnswer,
  ExitAnswer,
  FileEntryAnswer,
  HandleAnswer,
  HandleRequest,
  HttpRequestRequest,
  HttpResponseAnswer,
  MaybeAsync,
  ModelRequest,
  OpenedOf,
  RecipesAnswer,
  RequestArgs,
  RequestOf,
  ResponseOf,
  SpawnAnswer,
  StreamBinding,
  StreamName,
  Token,
  TokenDefinition,
  TokensAnswer,
  WasmSupport,
} from "./bindings.ts";

import * as backendNode from "./backend-node.ts";
import * as resolve from "./resolve.ts";
import type * as types from "./types.ts";

// ---------------------------------------------------------------------------
// Feature flag helpers
// ---------------------------------------------------------------------------

/**
 * Options for programmatic control of the loader order.
 * Environment variables take precedence: if an env var disables a step, it
 * stays disabled even if `LoadOptions` would enable it.
 */
export interface LoadOptions {
  /** Allow the native library through node:ffi. Default: `true` (unless `ESER_AJAN_NATIVE=disabled`). */
  native?: boolean;
  /** Allow the WASM fallback. Default: `true` (unless `ESER_AJAN_WASM=disabled`). */
  wasm?: boolean;
}

/** Reads an environment variable; `undefined` where there is no `process`. */
const getEnv = (name: string): string | undefined =>
  globalThis.process?.env[name];

/** Returns `true` when the given env var is set to `"disabled"` (case-insensitive). */
const isDisabledByEnv = (envVar: string): boolean => {
  const value = getEnv(envVar);
  return value !== undefined && value.toLowerCase() === "disabled";
};

/**
 * Emit a diagnostic about the loader order.
 *
 * Off unless ESER_AJAN_DEBUG is set, and on stderr when it is: stdout carries
 * command output, and `eser . commitmsg` documents piping its result to
 * pbcopy, so a diagnostic there would land in the clipboard.
 */
const debugLog = (message: string): void => {
  if (getEnv("ESER_AJAN_DEBUG") === undefined) {
    return;
  }

  // Opt-in diagnostics go to stderr directly; this module has no logger.
  // oxlint-disable-next-line no-console
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

/** Returns the shared library file extension for the current OS. */
export const getLibraryExtension: () => types.LibraryExtension =
  resolve.getLibraryExtension;

/**
 * Resolves the path to the eser-ajan shared library.
 * Delegates to `resolve.resolveLibraryPath()` with the module directory hint.
 */
export const resolveLibraryPath = (moduleDirHint?: string): string =>
  resolve.resolveLibraryPath(moduleDirHint ?? FFI_MODULE_DIR);

/**
 * What a failed native load needs the reader to know: how node:ffi is turned
 * on and off, and how to point the loader at the library.
 */
const NATIVE_HELP =
  `The native library loads through node:ffi, which needs Node 26.9 or later.\n` +
  `  - --no-experimental-ffi turns node:ffi off; drop that flag to use it.\n` +
  `  - Under the permission model (--permission), node:ffi needs --allow-ffi.\n` +
  `  - Set ESER_AJAN_LIB_PATH to the full path of the library to skip the search.\n` +
  `  See: https://github.com/eser/stack/tree/main/pkg/@eserstack/ajan`;

/**
 * Performs one real open: resolve, dlopen through node:ffi, or fall back to
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
  const opts: LoadOptions | undefined =
    typeof libraryPathOrOptions === "object" ? libraryPathOrOptions : options;

  // --- Global kill switch ---
  if (isDisabledByEnv("ESER_AJAN")) {
    debugLog("ALL disabled — ESER_AJAN=disabled");
    throw new Error(
      "Ajan is disabled via ESER_AJAN=disabled environment variable.\n" +
        "Unset ESER_AJAN to re-enable.",
    );
  }

  // --- Determine what's allowed ---
  const nativeAllowed =
    !isDisabledByEnv("ESER_AJAN_NATIVE") && opts?.native !== false;
  const wasmAllowed =
    !isDisabledByEnv("ESER_AJAN_WASM") && opts?.wasm !== false;

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

  // --- Try node:ffi ---
  // Kept for the failure paths below: whichever of resolveLibraryPath, the
  // node:ffi import or dlopen failed is the only description of WHY native is
  // unavailable, and every later throw has to carry it or it is lost for good.
  let nativeError: unknown;

  if (nativeAllowed) {
    try {
      const resolvedPath =
        libraryPath ?? resolve.resolveLibraryPath(FFI_MODULE_DIR);
      return await backendNode.open(resolvedPath);
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
        (nativeError === undefined
          ? `eser-ajan did not load: node:ffi was not tried, and the WASM fallback failed to load.\n`
          : `eser-ajan did not load through node:ffi, and the WASM fallback also failed to load.\n`) +
          `Native error: ${
            nativeError === undefined
              ? "node:ffi not attempted"
              : errorMessage(nativeError)
          }\n` +
          `WASM error: ${errorMessage(wasmErr)}\n\n` +
          NATIVE_HELP,
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
      `eser-ajan did not load through node:ffi, and no fallback is available.\n` +
        `Native error: ${errorMessage(nativeError)}\n` +
        `Fallback unavailable: ${reasons.join(", ")}\n\n` +
        NATIVE_HELP,
      { cause: nativeError },
    );
  }

  throw new Error(
    `Both node:ffi and the WASM fallback are disabled.\n` +
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
  });

/**
 * Opens the eser-ajan shared library through node:ffi, falling back to WASM
 * when node:ffi or the library cannot load.
 *
 * Callers asking for the same thing share one open. Roughly twenty packages in
 * this repo each used to hold their own loader singleton, so a process touching
 * logging, shell, formats and codebase paid four `dlopen` calls for one file;
 * they now share one handle.
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
  const opts: LoadOptions | undefined =
    typeof libraryPathOrOptions === "object" ? libraryPathOrOptions : options;

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
    backend: library.backend,
    handshake: library.handshake,
    call: library.call,
    stream: library.stream,
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
