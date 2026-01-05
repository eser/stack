// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno runtime entry point.
 *
 * @example
 * ```typescript
 * import { isRuntime, createDenoRuntime } from "@eser/standards/runtime/deno";
 *
 * if (isRuntime("deno")) {
 *   const runtime = createDenoRuntime();
 *   await runtime.fs.readTextFile("config.json");
 * }
 * ```
 *
 * @module
 */

// Detection utilities
export {
  detectRuntime,
  getRuntimeVersion,
  isBrowser,
  isEdge,
  isRuntime,
  isServer,
} from "./detect.ts";

// Deno adapter
export { createDenoRuntime, DENO_CAPABILITIES } from "./adapters/deno.ts";

// Re-export all types
export type {
  Arch,
  ChildProcess,
  CreateRuntimeOptions,
  DirEntry,
  FileInfo,
  FileOptions,
  MakeTempOptions,
  MkdirOptions,
  ParsedPath,
  Platform,
  PlatformInfo,
  ProcessOutput,
  ProcessStatus,
  RemoveOptions,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimeName,
  RuntimePath,
  RuntimeProcess,
  SpawnOptions,
  WriteFileOptions,
} from "./types.ts";

// Re-export errors
export {
  AlreadyExistsError,
  NotFoundError,
  ProcessError,
  RuntimeCapabilityError,
} from "./types.ts";
