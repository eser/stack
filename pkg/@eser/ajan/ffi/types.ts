// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared types for the FFI abstraction layer.
 *
 * Defines the unified interface that all runtime backends (Deno, Bun, Node)
 * must implement when loading the eser-ajan C-shared library.
 *
 * @module
 */

/**
 * The unified interface returned by every backend after opening a shared library.
 * Symbol methods mirror the C ABI exports from eser-ajan's main.go.
 */
export interface FFILibrary {
  symbols: {
    /** Returns the eser-ajan version string. Caller must free the result. */
    EserAjanVersion: () => string;
    /** Initializes the Go runtime bridge. Returns 0 on success. */
    EserAjanInit: () => number;
    /** Shuts down the Go runtime bridge. */
    EserAjanShutdown: () => void;
    /** Frees a C string previously allocated by Go. */
    EserAjanFree: (ptr: unknown) => void;
    /** Loads configuration from the given path. Returns JSON string. */
    EserAjanConfigLoad: (path: string) => string;
    /** Resolves a named dependency. Returns JSON string. */
    EserAjanDIResolve: (name: string) => string;
  };
  /** Closes the shared library handle and releases resources. */
  close: () => void;
}

/**
 * A backend that knows how to open a shared library using a specific runtime's
 * FFI mechanism.
 */
export interface FFIBackend {
  /** Human-readable backend name (e.g. "deno", "bun", "node"). */
  name: string;
  /** Returns true if this backend can be used in the current runtime. */
  available: () => boolean;
  /** Opens the shared library at `libraryPath` and returns a unified handle. */
  open: (libraryPath: string) => Promise<FFILibrary>;
}

/** Supported runtime identifiers. */
export type RuntimeId = "deno" | "bun" | "node" | "unknown";

/** Platform-specific shared library file extensions. */
export type LibraryExtension = ".so" | ".dylib" | ".dll";
