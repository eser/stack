// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime abstraction module.
 * Provides runtime-agnostic APIs for filesystem, path, exec, environment,
 * process control (signals included) and an HTTP server with WebSockets.
 *
 * Supports: Node.js, with fallbacks for Cloudflare Workers and browsers
 *
 * @example
 * ```typescript
 * import { runtime } from "@eserstack/standards/cross-runtime";
 * import * as standards from "@eserstack/standards";
 *
 * // Check capabilities before use
 * if (runtime.capabilities.fs) {
 *   const config = await runtime.fs.readTextFile("config.json");
 * }
 *
 * // Path is always available
 * const fullPath = runtime.path.join("src", "lib", "utils.ts");
 *
 * // For testing - use factory with mocks
 * const mockFs: standards.crossRuntime.RuntimeFs = {
 *   ...runtime.fs,
 *   readTextFile: () => Promise.resolve('{"debug":true}'),
 * };
 * const mockRuntime = await standards.crossRuntime.createRuntime({ fs: mockFs });
 * ```
 *
 * @module
 */

// Re-export types
export type {
  Arch,
  ChildProcess,
  CreateRuntimeOptions,
  DirEntry,
  FileInfo,
  FileOptions,
  FsEvent,
  FsWatcher,
  HttpHandler,
  HttpServer,
  MakeTempOptions,
  MkdirOptions,
  NetAddr,
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
  RuntimeHttp,
  RuntimeName,
  RuntimePath,
  RuntimeProcess,
  ServeHandlerInfo,
  ServeOptions,
  SignalName,
  SpawnOptions,
  WalkEntry,
  WalkOptions,
  WatchOptions,
  WebSocketUpgrade,
  WriteFileOptions,
} from "./types.ts";

// Re-export error classes
export {
  AlreadyExistsError,
  NotFoundError,
  PermissionDeniedError,
  ProcessError,
  RuntimeCapabilityError,
} from "./types.ts";

// Re-export detection and platform utilities (from shared adapter base layer)
export {
  detectRuntime,
  getArch,
  getHomedir,
  getPlatform,
  getPlatformInfo,
  getRuntimeVersion,
  getTmpdir,
  isBrowser,
  isEdge,
  isRuntime,
  isServer,
} from "./adapters/shared.ts";

// Re-export polyfills
export { posixPath, toPosix } from "./polyfills/path.ts";

// Re-export CLI execution context utilities
export {
  buildCommand,
  detectExecutionContext,
  detectInvoker,
  getCliPrefix,
  isCommandInPath,
  matchCliPrefix,
  resolvePathDirs,
} from "./execution-context.ts";
export type {
  CliCommandOptions,
  CliExecutionContext,
  CliInvoker,
  CliMode,
  CliRuntime,
} from "./execution-context.ts";

// Re-export Workers-specific utilities
export {
  clearEnv as clearWorkerdEnv,
  populateEnvFromContext,
} from "./adapters/workerd.ts";

import type {
  CreateRuntimeOptions,
  Runtime,
  RuntimeCapabilities,
} from "./types.ts";
import type { RuntimeName } from "./types.ts";
import * as shared from "./adapters/shared.ts";
import * as browser from "./adapters/browser.ts";
import * as node from "./adapters/node.ts";
import * as workerd from "./adapters/workerd.ts";

// The adapters are imported statically, so the module loads synchronously and
// `require()` can load it. Client bundles map the browser entry
// (`@eserstack/standards/cross-runtime/browser`) instead of this module.

/**
 * Runtime factory lookup table, keyed by the detected runtime.
 */
const runtimeFactories: Partial<Record<RuntimeName, () => Runtime>> = {
  node: node.createNodeRuntime,
  workerd: workerd.createWorkerdRuntime,
  browser: browser.createBrowserRuntime,
};

/**
 * Keys that can be overridden in runtime options.
 */
const overrideKeys: readonly (keyof CreateRuntimeOptions)[] = [
  "fs",
  "exec",
  "env",
  "path",
  "process",
  "http",
];

/**
 * Check if options contain any overrides.
 */
const hasOverrides = (options?: CreateRuntimeOptions): boolean =>
  options !== undefined &&
  overrideKeys.some((key) => options[key] !== undefined);

/**
 * Merge base runtime with overrides.
 */
const mergeRuntime = (
  base: Runtime,
  options: CreateRuntimeOptions,
  capabilities: RuntimeCapabilities,
): Runtime => ({
  name: base.name,
  version: base.version,
  capabilities,
  fs: options.fs ?? base.fs,
  path: options.path ?? base.path,
  exec: options.exec ?? base.exec,
  env: options.env ?? base.env,
  process: options.process ?? base.process,
  http: options.http ?? base.http,
});

/**
 * Creates the runtime instance for the detected runtime, with the overrides
 * applied, synchronously.
 */
const createRuntimeSync = (options?: CreateRuntimeOptions): Runtime => {
  const runtimeName = shared.detectRuntime();
  const factory = runtimeFactories[runtimeName];

  const baseRuntime =
    factory !== undefined
      ? factory()
      : shared.createFallbackRuntime(runtimeName);

  // Apply capability overrides if provided
  const capabilities =
    options?.capabilities !== undefined
      ? { ...baseRuntime.capabilities, ...options.capabilities }
      : baseRuntime.capabilities;

  if (options !== undefined && hasOverrides(options)) {
    return mergeRuntime(baseRuntime, options, capabilities);
  }

  // Return base runtime with potentially updated capabilities
  if (options?.capabilities !== undefined) {
    return { ...baseRuntime, capabilities };
  }

  return baseRuntime;
};

/**
 * Creates a runtime instance for the detected runtime.
 *
 * @param options - Optional overrides for testing or customization
 * @returns A Runtime instance
 */
export const createRuntime = (
  options?: CreateRuntimeOptions,
): Promise<Runtime> => Promise.resolve(createRuntimeSync(options));

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * The default runtime instance.
 * Auto-detected based on the current environment.
 *
 * @example
 * ```typescript
 * import { runtime } from "@eserstack/standards/cross-runtime";
 *
 * if (runtime.capabilities.fs) {
 *   const data = await runtime.fs.readTextFile("config.json");
 * }
 * ```
 */
export const runtime: Runtime = createRuntimeSync();
