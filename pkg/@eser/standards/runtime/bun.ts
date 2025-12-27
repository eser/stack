// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun runtime entry point.
 *
 * @example
 * ```typescript
 * import { isBun, createBunRuntime } from "@eser/standards/runtime/bun";
 *
 * if (isBun()) {
 *   const runtime = createBunRuntime();
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
  isBun,
  isDeno,
  isEdge,
  isNode,
  isServer,
  isWorkerd,
} from "./detect.ts";

// Bun adapter
export { BUN_CAPABILITIES, createBunRuntime } from "./adapters/bun.ts";

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
