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

/** Emit a debug-level log message. */
const debugLog = (message: string): void => {
  // deno-lint-ignore no-console
  console.debug(`[eser-ajan/ffi] ${message}`);
};

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
 * Selects the first available FFI backend for the current runtime,
 * respecting both environment-variable feature flags and programmatic
 * `LoadOptions`.
 *
 * @param options - Optional programmatic overrides.
 * @throws {Error} If no backend is available or all were disabled.
 */
export const selectBackend = (): types.FFIBackend => {
  for (const backend of BACKENDS) {
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
      `\nCurrent runtime: ${runtime}`,
  );
};

/**
 * Opens the eser-ajan shared library using the best available FFI backend.
 * Falls back to the WASM module when no native FFI backend or library is found.
 *
 * When `libraryPath` is omitted, the library is resolved automatically via
 * `resolveLibraryPath()`.
 *
 * Both environment variables and the `options` parameter control which
 * backends are attempted. See the module-level documentation for the full
 * list of feature-flag env vars.
 *
 * @param libraryPathOrOptions - Optional explicit path **or** a `LoadOptions` object.
 * @param options - Optional `LoadOptions` when a library path is also provided.
 * @returns A promise that resolves to a unified FFI library handle.
 * @throws {Error} If neither native FFI nor WASM fallback is available.
 */
export const loadEserAjan = async (
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

  if (!nativeAllowed) {
    debugLog("Native FFI disabled — skipping to WASM fallback");
  }

  if (!wasmAllowed) {
    debugLog("WASM fallback disabled");
  }

  // --- Try native FFI ---
  if (nativeAllowed) {
    try {
      const resolvedPath = libraryPath ??
        resolve.resolveLibraryPath(FFI_MODULE_DIR);
      const backend = selectBackend();
      return await backend.open(resolvedPath);
    } catch {
      // Native FFI not available — fall through to WASM
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
          `WASM error: ${
            wasmErr instanceof Error ? wasmErr.message : String(wasmErr)
          }\n\n` +
          `To fix this, install the @eser/ajan package or build the native library.\n` +
          `  See: https://github.com/eser/stack/tree/main/pkg/@eser/ajan`,
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

  throw new Error(
    `All FFI backends are disabled.\n` +
      `Reasons: ${reasons.join(", ")}\n\n` +
      `To fix this, unset the relevant environment variables or adjust LoadOptions.`,
  );
};
