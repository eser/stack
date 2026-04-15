// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Canonical platform target definitions for eser-ajan.
 *
 * Single source of truth for all platform identifiers. Every script that
 * needs platform info (build, npm package generation, CLI compilation)
 * imports from here instead of defining its own target list.
 *
 * Naming convention:
 *   Canonical ID uses `{arch}-{os}` with LLVM-style arch names:
 *     arch: "x86_64" | "aarch64"
 *     os:   "linux" | "darwin" | "windows"
 *
 *   Each target carries the ecosystem-specific translations:
 *     Go:    goos/goarch       (e.g. "darwin"/"arm64")
 *     npm:   os/cpu            (e.g. "darwin"/"arm64", note: "win32"/"x64")
 *     Deno:  target triple     (e.g. "aarch64-apple-darwin")
 *     Lib:   shared lib name   (e.g. "libeser_ajan.dylib")
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeTarget {
  /** Canonical ID: `{arch}-{os}` (e.g. "aarch64-darwin") */
  readonly id: string;

  // ── Go ──
  readonly goos: string;
  readonly goarch: string;
  /** Cross-compiler for `CC`. Undefined = use default. */
  readonly cc?: string;

  // ── npm ──
  /** npm `os` field (e.g. "darwin", "linux", "win32") */
  readonly npmOs: string;
  /** npm `cpu` field (e.g. "arm64", "x64") */
  readonly npmCpu: string;
  /** npm package suffix (e.g. "darwin-arm64", "win32-x64") */
  readonly npmSuffix: string;

  // ── Deno compile ──
  /** Deno/Rust target triple (e.g. "aarch64-apple-darwin") */
  readonly denoTarget: string;

  // ── Output ──
  /** Shared library filename */
  readonly libFile: string;
  /** Human-readable description */
  readonly description: string;
}

export interface WasmTarget {
  /** Canonical ID (e.g. "wasi", "wasi-reactor") */
  readonly id: string;
  readonly goos: string;
  readonly goarch: string;
  /** Output filename */
  readonly outputFile: string;
  /** Go build tags */
  readonly tags?: string;
}

// ---------------------------------------------------------------------------
// Native targets
// ---------------------------------------------------------------------------

/**
 * All supported native (FFI) targets.
 *
 * Note: aarch64-windows is omitted — Go does not support
 * `-buildmode=c-shared` on windows/arm64. WASM covers those users.
 */
export const NATIVE_TARGETS: readonly NativeTarget[] = [
  {
    id: "aarch64-darwin",
    goos: "darwin",
    goarch: "arm64",
    npmOs: "darwin",
    npmCpu: "arm64",
    npmSuffix: "darwin-arm64",
    denoTarget: "aarch64-apple-darwin",
    libFile: "libeser_ajan.dylib",
    description: "eser-ajan shared library for macOS ARM64 (Apple Silicon)",
  },
  {
    id: "x86_64-darwin",
    goos: "darwin",
    goarch: "amd64",
    cc: "clang -arch x86_64",
    npmOs: "darwin",
    npmCpu: "x64",
    npmSuffix: "darwin-x64",
    denoTarget: "x86_64-apple-darwin",
    libFile: "libeser_ajan.dylib",
    description: "eser-ajan shared library for macOS x64 (Intel)",
  },
  {
    id: "aarch64-linux",
    goos: "linux",
    goarch: "arm64",
    cc: "aarch64-linux-gnu-gcc",
    npmOs: "linux",
    npmCpu: "arm64",
    npmSuffix: "linux-arm64",
    denoTarget: "aarch64-unknown-linux-gnu",
    libFile: "libeser_ajan.so",
    description: "eser-ajan shared library for Linux ARM64",
  },
  {
    id: "x86_64-linux",
    goos: "linux",
    goarch: "amd64",
    cc: "x86_64-linux-gnu-gcc",
    npmOs: "linux",
    npmCpu: "x64",
    npmSuffix: "linux-x64",
    denoTarget: "x86_64-unknown-linux-gnu",
    libFile: "libeser_ajan.so",
    description: "eser-ajan shared library for Linux x64",
  },
  {
    id: "x86_64-windows",
    goos: "windows",
    goarch: "amd64",
    cc: "x86_64-w64-mingw32-gcc",
    npmOs: "win32",
    npmCpu: "x64",
    npmSuffix: "win32-x64",
    denoTarget: "x86_64-pc-windows-msvc",
    libFile: "libeser_ajan.dll",
    description: "eser-ajan shared library for Windows x64",
  },
] as const;

// ---------------------------------------------------------------------------
// WASM targets
// ---------------------------------------------------------------------------

export const WASM_TARGETS: readonly WasmTarget[] = [
  {
    id: "wasi",
    goos: "wasip1",
    goarch: "wasm",
    outputFile: "eser-ajan.wasm",
  },
  {
    id: "wasi-reactor",
    goos: "wasip1",
    goarch: "wasm",
    outputFile: "eser-ajan-reactor.wasm",
    tags: "eserajan_reactor",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All build targets (native + WASM). Returns id list. */
export const ALL_TARGET_IDS: readonly string[] = [
  ...NATIVE_TARGETS.map((t) => t.id),
  ...WASM_TARGETS.map((t) => t.id),
];

/** Look up a native target by its canonical ID. */
export const findNativeTarget = (
  id: string,
): NativeTarget | undefined => NATIVE_TARGETS.find((t) => t.id === id);

/** Look up a WASM target by its canonical ID. */
export const findWasmTarget = (
  id: string,
): WasmTarget | undefined => WASM_TARGETS.find((t) => t.id === id);

/** Look up any target (native or WASM) by canonical ID. */
export const findTarget = (
  id: string,
): NativeTarget | WasmTarget | undefined =>
  findNativeTarget(id) ?? findWasmTarget(id);

/** Look up a native target by its Deno compile triple. */
export const findByDenoTarget = (
  triple: string,
): NativeTarget | undefined =>
  NATIVE_TARGETS.find((t) => t.denoTarget === triple);

/** npm scope for platform packages. */
export const NPM_SCOPE = "@eserstack";

/** npm package prefix. */
export const NPM_PKG_PREFIX = "ajan";

/** WASM npm package suffix. */
export const NPM_WASM_SUFFIX = "wasm";
