// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js runtime entry point.
 *
 * @example
 * ```typescript
 * import { isRuntime, createNodeRuntime } from "@eser/standards/cross-runtime/node";
 *
 * if (isRuntime("node")) {
 *   const runtime = createNodeRuntime();
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

// Node adapter
export { createNodeRuntime, NODE_CAPABILITIES } from "./adapters/node.ts";

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
