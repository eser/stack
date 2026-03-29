// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime abstraction module.
 * Provides runtime-agnostic APIs for filesystem, path, exec, and environment.
 *
 * Supports: Deno, Node.js, Bun, Cloudflare Workers
 *
 * @example
 * ```typescript
 * import { runtime } from "@eser/standards/cross-runtime";
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
 * import { createRuntime } from "@eser/standards/cross-runtime";
 * const mockRuntime = await createRuntime({ fs: mockFs });
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
  WalkEntry,
  WalkOptions,
  WatchOptions,
  WriteFileOptions,
} from "./types.ts";

// Re-export error classes
export {
  AlreadyExistsError,
  NotFoundError,
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
import { createFallbackRuntime, detectRuntime } from "./adapters/shared.ts";

// Adapters are loaded lazily via dynamic import() — only the detected
// runtime's adapter is imported. This avoids loading all 5 adapters
// (and their platform-specific dependencies) at startup.

import type { RuntimeName } from "./types.ts";

/**
 * Runtime factory lookup table — each factory lazily imports its adapter.
 * Only the detected runtime's adapter module is loaded.
 */
const runtimeFactories: Partial<
  Record<RuntimeName, () => Promise<Runtime>>
> = {
  deno: async () => {
    const mod = await import("./adapters/deno.ts");
    return mod.createDenoRuntime();
  },
  node: async () => {
    const mod = await import("./adapters/node.ts");
    return mod.createNodeRuntime();
  },
  bun: async () => {
    const mod = await import("./adapters/bun.ts");
    return mod.createBunRuntime();
  },
  workerd: async () => {
    const mod = await import("./adapters/workerd.ts");
    return mod.createWorkerdRuntime();
  },
  browser: async () => {
    const mod = await import("./adapters/browser.ts");
    return mod.createBrowserRuntime();
  },
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
});

/**
 * Creates a runtime instance for the detected or specified runtime.
 *
 * @param options - Optional overrides for testing or customization
 * @returns A Runtime instance
 */
export const createRuntime = async (
  options?: CreateRuntimeOptions,
): Promise<Runtime> => {
  const runtimeName = detectRuntime();
  const factory = runtimeFactories[runtimeName];

  const baseRuntime = factory !== undefined
    ? await factory()
    : createFallbackRuntime(runtimeName);

  // Apply capability overrides if provided
  const capabilities = options?.capabilities
    ? { ...baseRuntime.capabilities, ...options.capabilities }
    : baseRuntime.capabilities;

  if (options !== undefined && hasOverrides(options)) {
    return mergeRuntime(baseRuntime, options, capabilities);
  }

  // Return base runtime with potentially updated capabilities
  if (options?.capabilities) {
    return { ...baseRuntime, capabilities };
  }

  return baseRuntime;
};

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * The default runtime instance.
 * Auto-detected based on the current environment.
 *
 * @example
 * ```typescript
 * import { runtime } from "@eser/standards/cross-runtime";
 *
 * if (runtime.capabilities.fs) {
 *   const data = await runtime.fs.readTextFile("config.json");
 * }
 * ```
 */
// deno-lint-ignore no-top-level-await
export const runtime: Runtime = await createRuntime();
